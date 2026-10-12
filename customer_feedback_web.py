#!/usr/bin/env python3
"""Local browser interface for the customer feedback agent."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import threading
import uuid
from collections import Counter
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import customer_feedback_agent as agent


MAX_UPLOAD_BYTES = 20 * 1024 * 1024
BATCH_SIZE = 20
JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
ACTIVE_JOB: str | None = None

PAGE = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Customer feedback analysis</title>
  <style>
    :root { color-scheme: light; --ink:#17212b; --muted:#536273; --line:#d9e1e8; --blue:#1459a6; --pale:#f4f7fa; }
    * { box-sizing:border-box; }
    body { margin:0; background:#f4f6f8; color:var(--ink); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { max-width:1080px; margin:40px auto; padding:0 20px 56px; }
    h1 { margin:0 0 8px; font-size:32px; letter-spacing:-.03em; }
    h2 { margin:0 0 14px; font-size:20px; }
    p { color:var(--muted); }
    .card { background:white; border:1px solid var(--line); border-radius:14px; padding:24px; margin:18px 0; box-shadow:0 2px 10px #17212b0a; }
    .upload { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    input[type=file] { max-width:100%; padding:10px; border:1px solid var(--line); border-radius:8px; }
    button,.download { background:var(--blue); color:white; border:0; border-radius:8px; padding:11px 18px; font-weight:650; text-decoration:none; cursor:pointer; }
    button:disabled { opacity:.55; cursor:wait; }
    .hint { font-size:14px; margin-bottom:0; }
    #status { min-height:24px; color:var(--blue); font-weight:600; }
    #error { color:#9b1c1c; white-space:pre-wrap; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px; }
    .stat { background:var(--pale); border-radius:10px; padding:14px; }
    .stat strong { display:block; font-size:24px; }
    .stat span { color:var(--muted); font-size:13px; }
    .summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:14px; }
    .summary { border:1px solid var(--line); border-radius:10px; padding:16px; }
    .summary h3 { margin:0 0 8px; font-size:16px; }
    .summary ul { margin:0; padding-left:20px; color:var(--ink); }
    .summary li { margin:0 0 7px; }
    .table-wrap { overflow:auto; max-height:560px; border:1px solid var(--line); border-radius:9px; }
    table { width:100%; border-collapse:collapse; background:white; font-size:14px; }
    th,td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { position:sticky; top:0; background:#eef3f8; z-index:1; }
    td.comment { min-width:340px; white-space:pre-wrap; }
    .badge { display:inline-block; padding:3px 8px; border-radius:99px; background:#e8eef5; font-size:12px; white-space:nowrap; }
    .actions { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
    [hidden] { display:none !important; }
    @media(max-width:600px) { main { margin:22px auto; } .card { padding:17px; } h1 { font-size:27px; } }
  </style>
</head>
<body>
<main>
  <h1>Customer feedback analysis</h1>
  <p>Upload a CSV or Excel file with a <b>rating/CSAT score</b> (1–5) and a <b>comment</b> column. Optional segment fields help group requested improvements. The local model categorizes comments using their text and rating, then produces four focused analyses.</p>
  <section class="card">
    <form id="upload-form" class="upload">
      <input id="file" name="file" type="file" accept=".csv,.xlsx,.xlsm" required>
      <button id="submit" type="submit">Analyze comments</button>
    </form>
    <p class="hint">CSV and Excel (.xlsx) files up to 20 MB. Blank comments are skipped. Analysis stays on this computer.</p>
    <p id="status" role="status"></p>
    <p id="error" role="alert"></p>
  </section>
  <section id="results" hidden>
    <section class="card">
      <div class="actions"><div><h2>Analysis overview</h2><p id="rating-summary"></p></div><a id="download" class="download" href="#">Download categorized CSV</a></div>
      <div id="stats" class="stats"></div>
    </section>
    <section class="card">
      <h2>Customer themes</h2>
      <div id="summaries" class="summary-grid"></div>
    </section>
    <section class="card">
      <h2>Comment-by-comment classification</h2>
      <p id="table-note" class="hint"></p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Country</th><th>Rating</th><th>Category</th><th>Comment</th></tr></thead><tbody id="comments"></tbody></table></div>
    </section>
  </section>
</main>
<script>
const form=document.getElementById('upload-form'), button=document.getElementById('submit');
const statusEl=document.getElementById('status'), errorEl=document.getElementById('error');
const resultEl=document.getElementById('results');
const categoryNames=['Bug','Feature Request','UI/UX Issue','Performance','Praise'];
const titleMap={low_csat_frustrations:'Top frustration areas (ratings 1–3)',requested_capabilities:'Requested improvements by user segment',uiux_paths:'Interaction and navigation friction (UI/UX Issue)',high_score_friction:'Constructive feedback from high scorers (ratings 4–5; 25+ words)'};
form.addEventListener('submit',async event=>{
  event.preventDefault(); errorEl.textContent=''; resultEl.hidden=true;
  const file=document.getElementById('file').files[0]; if(!file)return;
  button.disabled=true; statusEl.textContent='Uploading file…';
  try {
    const data=new FormData(); data.append('file',file);
    const response=await fetch('/api/upload',{method:'POST',body:data});
    const payload=await response.json(); if(!response.ok)throw new Error(payload.error||'Upload failed');
    await poll(payload.job_id);
  } catch(err) { errorEl.textContent=err.message; statusEl.textContent=''; button.disabled=false; }
});
async function poll(id) {
  try {
    const response=await fetch('/api/jobs/'+id); const job=await response.json();
    if(!response.ok)throw new Error(job.error||'Could not read analysis status');
    if(job.state==='running') { statusEl.textContent=job.phase==='summarizing'?'Writing the customer summary…':`Classifying ${job.processed.toLocaleString()} of ${job.total.toLocaleString()} comments with the local model…`; setTimeout(()=>poll(id),1200); return; }
    if(job.state==='error')throw new Error(job.error);
    showResults(id,job); statusEl.textContent='Analysis complete.'; button.disabled=false;
  } catch(err) { errorEl.textContent=err.message; statusEl.textContent=''; button.disabled=false; }
}
function showResults(id,job) {
  resultEl.hidden=false; document.getElementById('download').href='/api/jobs/'+id+'/download';
  document.getElementById('rating-summary').textContent=`${job.total.toLocaleString()} comments analyzed · Average rating ${job.average_rating}/5 · Model ${job.model}`;
  const stats=document.getElementById('stats'); stats.replaceChildren();
  for(const name of categoryNames){const box=document.createElement('div');box.className='stat';const n=document.createElement('strong');n.textContent=(job.counts[name]||0).toLocaleString();const label=document.createElement('span');label.textContent=name;box.append(n,label);stats.append(box);}
  const summaries=document.getElementById('summaries'); summaries.replaceChildren();
  for(const [key,title] of Object.entries(titleMap)){
    const box=document.createElement('article');box.className='summary';const h=document.createElement('h3');h.textContent=title;box.append(h);
    const ul=document.createElement('ul');
    const raw=job.summaries[key]||'No clear signal in the eligible comments.';
    let bullets;
    if(Array.isArray(raw)) bullets=raw;
    else {
      const summary=String(raw).trim();
      try {
        const parsed=JSON.parse(summary);
        bullets=Array.isArray(parsed)?parsed:[summary];
      } catch {
        bullets=summary.split(/\r?\n/);
      }
    }
    const cleaned=bullets.map(line=>String(line).replace(/^\s*[-•*]\s*/, '').trim()).filter(line=>line&&!/^no clear signal\b/i.test(line));
    if(cleaned.length>1){for(let i=cleaned.length-1;i>=0;i--)if(/^no clear signal\b/i.test(cleaned[i]))cleaned.splice(i,1);}
    for(const text of cleaned){const li=document.createElement('li');li.textContent=text;ul.append(li);}
    if(!cleaned.length){const li=document.createElement('li');li.textContent='No specific themes were identified in the eligible comments.';ul.append(li);}
    box.append(ul);summaries.append(box);
  }
  const body=document.getElementById('comments');body.replaceChildren();
  for(const item of job.preview){const tr=document.createElement('tr');for(const value of [item.date,item.country,item.rating]){const td=document.createElement('td');td.textContent=value??'';tr.append(td);}const category=document.createElement('td');const badge=document.createElement('span');badge.className='badge';badge.textContent=item.category;category.append(badge);tr.append(category);const comment=document.createElement('td');comment.className='comment';comment.textContent=item.comment;tr.append(comment);body.append(tr);}
  document.getElementById('table-note').textContent=job.total>job.preview.length?`Showing ${job.preview.length} of ${job.total.toLocaleString()} comments. Download the CSV to view every classification.`:`${job.total} comments.`;
}
</script>
</body>
</html>"""


def normalized_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())


HEADER_ALIASES = {
    "date": {"date", "responsedate", "timestamp", "createdat"},
    "country": {"country", "countrycode", "region", "market"},
    "rating": {"rating", "score", "stars", "csat", "csatscore", "customersatisfaction", "overallsatisfaction"},
    "comments": {"comments", "comment", "feedback", "review", "text"},
}


def column_map(headers: list[str]) -> dict[str, str]:
    found: dict[str, str] = {}
    for header in headers:
        key = normalized_header(header)
        for required, aliases in HEADER_ALIASES.items():
            if key in aliases and required not in found:
                found[required] = header
    missing = [name for name in ("rating", "comments") if name not in found]
    if missing:
        raise ValueError("Missing required column(s): " + ", ".join(missing) + ". Expected a rating/CSAT column and a comment/feedback column.")
    return found


def validate_rows(rows: list[dict[str, Any]], headers: list[str], source: str, sheet: str = "") -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    columns = column_map(headers)
    records = []
    raw_rows = []
    for line_number, row in enumerate(rows, 2):
        comment = str(row.get(columns["comments"]) or "").strip()
        if not comment:
            continue
        raw_rating = row.get(columns["rating"])
        try:
            rating_num = float(raw_rating)
        except (TypeError, ValueError):
            raise ValueError(f"Row {line_number}: rating must be an integer from 1 to 5.")
        if not rating_num.is_integer() or not 1 <= rating_num <= 5:
            raise ValueError(f"Row {line_number}: rating must be an integer from 1 to 5.")
        row_fields = {str(k): v for k, v in row.items() if k is not None}
        records.append({
            "row_index": len(raw_rows),
            "comment": comment,
            "rating": int(rating_num),
            "date": row.get(columns["date"]) if "date" in columns else None,
            "country": row.get(columns["country"]) if "country" in columns else None,
            "source": source,
            "fields": row_fields,
        })
        raw_rows.append(row_fields)
    return records, raw_rows


def parse_upload(filename: str, content: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("cp1252")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        headers = [str(value or "").strip() for value in (reader.fieldnames or [])]
        reader.fieldnames = headers
        if not headers:
            raise ValueError("The CSV file has no header row.")
        records, raw_rows = validate_rows(list(reader), headers, filename)
        columns = headers
    elif suffix in {".xlsx", ".xlsm"}:
        try:
            import openpyxl
        except ImportError as exc:
            raise RuntimeError("Excel upload requires openpyxl. Install it with: python3 -m pip install openpyxl") from exc
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        records, raw_rows, columns = [], [], []
        errors = []
        for worksheet in workbook.worksheets:
            iterator = worksheet.iter_rows(values_only=True)
            header_row = next(iterator, None)
            if not header_row:
                continue
            headers = [str(value).strip() if value is not None else "" for value in header_row]
            try:
                column_map(headers)
            except ValueError:
                # Ignore workbook sheets that are not feedback tables.
                continue
            try:
                sheet_records, sheet_rows = validate_rows([dict(zip(headers, values)) for values in iterator], headers, filename, worksheet.title)
            except ValueError as exc:
                errors.append(f"Sheet {worksheet.title}: {exc}")
                continue
            for record, row in zip(sheet_records, sheet_rows):
                record["row_index"] = len(raw_rows)
                record["sheet"] = worksheet.title
                raw_rows.append(row)
                records.append(record)
            for column in headers:
                if column not in columns:
                    columns.append(column)
        workbook.close()
        if not columns and errors:
            raise ValueError(errors[0])
    else:
        raise ValueError("Choose a CSV or Excel workbook (.xlsx or .xlsm).")
    if not records:
        raise ValueError("No non-empty comments were found in the file.")
    return records, raw_rows, columns


def summarize_feedback(analyzed: list[dict[str, Any]]) -> dict[str, str]:
    return agent.summarize_feedback(analyzed)


def run_job(job_id: str, filename: str, records: list[dict[str, Any]], columns: list[str]) -> None:
    global ACTIVE_JOB
    analyzed = []
    try:
        total = len(records)
        for offset in range(0, total, BATCH_SIZE):
            batch = records[offset : offset + BATCH_SIZE]
            results, _ = agent.analyze_batch_resilient(batch, offset + 1)
            analyzed.extend({**record, **result} for record, result in zip(batch, results))
            with JOBS_LOCK:
                JOBS[job_id].update({"processed": len(analyzed), "phase": "classifying"})
        with JOBS_LOCK:
            JOBS[job_id].update({"phase": "summarizing"})
        summaries = summarize_feedback(analyzed)
        counts = Counter(item["category"] for item in analyzed)
        ratings = [float(item["rating"]) for item in analyzed if 1 <= float(item["rating"]) <= 5]
        with JOBS_LOCK:
            JOBS[job_id].update({
                "state": "complete",
                "phase": "complete",
                "processed": total,
                "total": total,
                "filename": filename,
                "columns": columns,
                "rows": raw_rows_for_download(analyzed, columns),
                "summaries": summaries,
                "counts": {category: counts.get(category, 0) for category in agent.CATEGORIES},
                "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
                "model": agent.MODEL,
            })
    except Exception as exc:
        with JOBS_LOCK:
            JOBS[job_id].update({"state": "error", "error": str(exc), "phase": "error"})
    finally:
        with JOBS_LOCK:
            if ACTIVE_JOB == job_id:
                ACTIVE_JOB = None


def raw_rows_for_download(analyzed: list[dict[str, Any]], columns: list[str]) -> list[dict[str, Any]]:
    rows = []
    for item in analyzed:
        row = {column: item["fields"].get(column, "") for column in columns}
        row["AI Category"] = item["category"]
        rows.append(row)
    return rows


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalFeedback/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print("[feedback-web] " + fmt % args)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        path = urlparse(self.path).path
        if path == "/":
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        match = re.fullmatch(r"/api/jobs/([a-f0-9]+)(/download)?", path)
        if not match:
            self.send_json(404, {"error": "Not found"})
            return
        job_id, download = match.groups()
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job is None:
                self.send_json(404, {"error": "Analysis job not found"})
                return
            if download:
                if job["state"] != "complete":
                    self.send_json(409, {"error": "The categorized file is not ready yet"})
                    return
                rows = job["rows"]
                columns = job["columns"] + ["AI Category"]
                filename = re.sub(r"[^A-Za-z0-9_.-]", "_", Path(job["filename"]).stem) + "_categorized.csv"
            else:
                response = {key: job.get(key) for key in ("state", "phase", "processed", "total", "error")}
                if job["state"] == "complete":
                    response.update({key: job[key] for key in ("summaries", "counts", "average_rating", "model")})
                    response["preview"] = [
                        {"date": str(row.get(agent.field(row, ("date", "response date")) or "") or ""),
                         "country": str(agent.field(row, ("country", "country code")) or ""),
                         "rating": str(agent.field(row, ("rating", "score", "stars")) or ""),
                         "comment": str(agent.field(row, ("comments", "comment", "feedback", "review", "text")) or ""),
                         "category": str(row.get("AI Category", ""))}
                        for row in job["rows"][:500]
                    ]
                self.send_json(200, response)
                return
        output = io.StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        body = output.getvalue().encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        global ACTIVE_JOB
        if urlparse(self.path).path != "/api/upload":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_UPLOAD_BYTES:
                raise ValueError("Choose a file smaller than 20 MB.")
            content_type = self.headers.get("Content-Type", "")
            body = self.rfile.read(length)
            message = BytesParser(policy=policy.default).parsebytes(
                b"Content-Type: " + content_type.encode("ascii") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body
            )
            filename, content = None, None
            if message.is_multipart():
                for part in message.iter_parts():
                    if part.get_content_disposition() == "form-data" and part.get_param("name", header="content-disposition") == "file":
                        filename = part.get_filename()
                        content = part.get_payload(decode=True)
                        break
            if not filename or content is None:
                raise ValueError("Choose a CSV or Excel file to upload.")
            safe_filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
            records, raw_rows, columns = parse_upload(safe_filename, content)
            del raw_rows
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})
            return
        with JOBS_LOCK:
            if ACTIVE_JOB:
                self.send_json(409, {"error": "Another file is still being analyzed. Wait for it to finish first."})
                return
            job_id = uuid.uuid4().hex
            JOBS[job_id] = {"state": "running", "phase": "classifying", "processed": 0, "total": len(records)}
            ACTIVE_JOB = job_id
            for key in list(JOBS):
                if len(JOBS) <= 5:
                    break
                if key != ACTIVE_JOB and JOBS[key].get("state") != "running":
                    del JOBS[key]
        worker = threading.Thread(target=run_job, args=(job_id, Path(filename).name, records, columns), daemon=True)
        worker.start()
        self.send_json(202, {"job_id": job_id})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Bind interface (default: localhost only)")
    parser.add_argument("--port", type=int, default=8000, help="Local web port")
    parser.add_argument("--model", default=agent.MODEL, help=f"Ollama model (default: {agent.MODEL})")
    args = parser.parse_args()
    agent.MODEL = args.model
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as exc:
        print(f"Could not start interface: {exc}", file=sys.stderr)
        return 1
    print(f"Customer feedback interface ready at http://{args.host}:{args.port}")
    print(f"Local model: {agent.MODEL}. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping interface.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
