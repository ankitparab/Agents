const ROLE_ENV_PREFIX = {
  orchestrator: "ORCHESTRATOR",
  critique: "UX_CRITIQUE",
  variants: "VARIANT_GENERATOR"
};

function value(name) {
  return process.env[name]?.trim();
}

export function modelConfig(role) {
  const prefix = ROLE_ENV_PREFIX[role];
  const separate = value("AGENT_MODEL_MODE") === "separate";
  const provider = separate ? value(`${prefix}_LLM_PROVIDER`) || value("LLM_PROVIDER") : value("LLM_PROVIDER");
  const model = separate ? value(`${prefix}_LLM_MODEL`) || value("LLM_MODEL") : value("LLM_MODEL");
  const apiKey = separate ? value(`${prefix}_LLM_API_KEY`) || value("LLM_API_KEY") : value("LLM_API_KEY");
  const baseUrl = separate ? value(`${prefix}_LLM_BASE_URL`) || value("LLM_BASE_URL") : value("LLM_BASE_URL");
  return { provider, model, apiKey, baseUrl, mode: separate ? "separate" : "single" };
}

export function llmIsConfigured() {
  return ["orchestrator", "critique", "variants"].every((role) => {
    const config = modelConfig(role);
    return Boolean(config.provider && config.model && config.baseUrl && (config.provider === "ollama" || config.apiKey));
  });
}

function extractText(response) {
  if (typeof response?.message?.content === "string") return response.message.content;
  if (typeof response?.choices?.[0]?.message?.content === "string") return response.choices[0].message.content;
  throw new Error("The model response did not contain message content.");
}

export function parseJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return a JSON object.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function askModel(role, { system, user }) {
  const config = modelConfig(role);
  if (!config.provider || !config.model || !config.baseUrl || (config.provider !== "ollama" && !config.apiKey)) {
    throw new Error(`LLM configuration for ${role} is incomplete. Set provider, model, base URL, and API key in .env.`);
  }
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const isOllama = config.provider === "ollama";
  const endpoint = isOllama ? `${baseUrl}/api/chat` : `${baseUrl}/chat/completions`;
  const payload = isOllama
    ? { model: config.model, stream: false, format: "json", messages: [{ role: "system", content: system }, { role: "user", content: user }] }
    : { model: config.model, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  const headers = { "content-type": "application/json" };
  if (!isOllama) headers.authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`LLM request for ${role} failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return extractText(await response.json());
}
