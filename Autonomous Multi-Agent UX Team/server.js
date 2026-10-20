import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { evaluateFigmaTree } from "./src/evaluator.js";
import { createPrototype } from "./src/prototype.js";
import { llmIsConfigured } from "./src/llm.js";
import { runPipeline, validateFigmaInput } from "./src/pipeline.js";
import { loadLocalEnv } from "./src/env.js";

await loadLocalEnv();

const port = Number(process.env.PORT || 4173);
const maxRequestBytes = Number(process.env.MAX_REQUEST_BYTES || 1_048_576);
const publicDirectory = join(process.cwd(), "public");
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body));
}

async function requestJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxRequestBytes) throw new Error("Request exceeds the configured size limit.");
  }
  return JSON.parse(body || "{}");
}

function findRoot(payload) {
  return payload.document || payload.root || payload?.data?.document || payload;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const payload = await requestJson(request);
      const root = findRoot(payload.figma || payload);
      validateFigmaInput(root);
      const analysis = evaluateFigmaTree(root);
      const context = String(payload.context || "").slice(0, 500);
      const assumptions = [
        "The supplied frame represents one step within a broader task flow.",
        "Generated screens are inferred and should be reviewed before implementation.",
        context ? `User-provided task context: ${context}` : "No task context was supplied; recommendations use layout evidence only."
      ];
      const responseBody = {
        ...analysis,
        assumptions,
        generatedBy: "rules-only",
        variants: {
          minimalFriction: createPrototype({ variant: "minimal", context, findings: analysis.findings }),
          behavioral: createPrototype({ variant: "behavioral", context, findings: analysis.findings })
        }
      };
      if (payload.runLlm) {
        if (!llmIsConfigured()) return send(response, 400, { error: "LLM mode is not configured. Copy .env.example to .env and set provider, model, base URL, and a backend-only key." });
        const pipeline = await runPipeline({ figma: root, context, deterministicFindings: analysis.findings });
        responseBody.generatedBy = "three-agent-llm-pipeline";
        responseBody.supervisor = pipeline.supervisor;
        responseBody.audit = pipeline.audit;
        responseBody.variantCode = pipeline.variants;
      }
      send(response, 200, responseBody);
      return;
    }
    if (request.method === "GET") {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const filename = normalize(join(publicDirectory, requested));
      if (!filename.startsWith(publicDirectory)) return send(response, 403, "Forbidden", "text/plain; charset=utf-8");
      const file = await readFile(filename);
      return send(response, 200, file, contentTypes[extname(filename)] || "application/octet-stream");
    }
    send(response, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = error instanceof SyntaxError || /exceeds/.test(error.message) ? 400 : 500;
    send(response, status, { error: error.message || "Unexpected server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Design Critique Copilot running at http://127.0.0.1:${port}`);
});
