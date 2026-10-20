const $ = (selector) => document.querySelector(selector);
const textarea = $("#figma-json");
const context = $("#context");
const error = $("#error");
const results = $("#results");
let latest = null;
let selectedVariant = "minimalFriction";

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function renderFindings() {
  const filter = $("#filter").value;
  const filtered = latest.findings.filter((finding) => filter === "all" || finding.severity === filter);
  $("#findings").innerHTML = filtered.length ? filtered.map((item) => `
    <article class="finding ${item.severity}">
      <div class="finding-head"><h3>${escapeHtml(item.framework)}</h3><span class="pill">${escapeHtml(item.severity)} · ${escapeHtml(item.kind)}</span></div>
      <p>${escapeHtml(item.explanation)}</p>
      <div class="recommendation"><strong>Recommended change:</strong> ${escapeHtml(item.recommendation)}</div>
      <p><small>Evidence: ${escapeHtml(JSON.stringify(item.evidence))} · Nodes: ${escapeHtml(item.nodeIds.join(", "))}</small></p>
    </article>`).join("") : "<p class=\"hint\">No findings at this severity.</p>";
}

function render(result) {
  latest = result;
  $("#risk-score").textContent = result.riskScore;
  $("#finding-count").textContent = result.findings.length;
  $("#mode").textContent = result.generatedBy === "rules-only" ? "Rules" : "Hybrid";
  $("#assumptions").innerHTML = result.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join("");
  renderVariant(result);
  renderFindings();
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderVariant(result) {
  const sandbox = $("#sandbox");
  const code = $("#variant-code");
  if (result.variantCode) {
    sandbox.hidden = true;
    code.hidden = false;
    code.textContent = selectedVariant === "minimalFriction" ? result.variantCode.variantA : result.variantCode.variantB;
    return;
  }
  code.hidden = true;
  sandbox.hidden = false;
  sandbox.srcdoc = result.variants[selectedVariant];
}

async function loadFixture() {
  const response = await fetch("/fixture.json");
  textarea.value = JSON.stringify(await response.json(), null, 2);
  error.textContent = "";
}

$("#fixture").addEventListener("click", loadFixture);
$("#figma-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const text = await file.text();
    JSON.parse(text);
    textarea.value = text;
    error.textContent = "";
  } catch { error.textContent = "The uploaded file is not valid JSON."; }
});
$("#filter").addEventListener("change", renderFindings);
document.querySelectorAll("[data-variant]").forEach((button) => button.addEventListener("click", () => {
  selectedVariant = button.dataset.variant;
  document.querySelectorAll("[data-variant]").forEach((tab) => tab.classList.toggle("active", tab === button));
  if (latest) renderVariant(latest);
}));

$("#analyze").addEventListener("click", async () => {
  error.textContent = "";
  let figma;
  try { figma = JSON.parse(textarea.value); } catch { error.textContent = "Paste valid JSON first."; return; }
  const button = $("#analyze");
  button.disabled = true;
  button.textContent = "Analyzing…";
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ figma, context: context.value, runLlm: $("#run-llm").checked }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Analysis failed.");
    render(result);
  } catch (requestError) { error.textContent = requestError.message; }
  finally { button.disabled = false; button.textContent = "Run critique"; }
});

loadFixture();
