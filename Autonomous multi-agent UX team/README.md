# Autonomous Multi-Agent UX Team

A local, multi-agent Figma design-review and prototyping tool. It accepts pasted or uploaded Figma node-tree JSON, applies deterministic evidence checks, and can run three sequential LLM agents:

- **Variant A — Minimal friction:** accessible, task-focused completion.
- **Variant B — Behavioral nudge:** clear hierarchy, confidence cues, and transparent behavioral patterns.

1. **Supervisor / Orchestrator** validates the source and enforces a draft-and-review checkpoint.
2. **UX Critique Agent** returns schema-validated `ux_audit.json` findings.
3. **Variant Generator Agent** creates schema-validated React/Tailwind `VariantA.jsx` and `VariantB.jsx` source.

The app has no dependencies and runs with Node.js 20+. Its default mode uses no API key and sends no design data to an LLM; enable the LLM pipeline only after configuring a backend-only provider key.

## What the current prototype evaluates

| Framework | Current signal |
| --- | --- |
| WCAG 2.2 | Interactive targets below 24px, plus 44px recommended-target guidance |
| Fitts's Law | Interactive targets below the recommended 44px acquisition size |
| Hick's Law | More than four peer actions in the same parent node |
| Cognitive load | High visible word count or text density |
| Von Restorff Effect | Primary action shares size and fill with sibling actions |
| Gestalt Proximity | Likely label-to-input pair is structurally too far apart |

Findings are labelled **measured** when they come directly from node data and **likely** when they are evidence-backed UX inferences that need human review.

## Run locally

```sh
cd "Autonomous multi-agent UX team"
npm start
```

Open <http://127.0.0.1:4173>. The server intentionally binds to localhost.

The supplied checkout fixture is loaded automatically. Paste or upload a Figma frame/document JSON object, optionally add task context, and choose **Run critique**. Select **Run the three-agent LLM pipeline** to invoke the configured agents.

## Verify

```sh
npm run check
npm test
```

## Key and model configuration

Copy `.env.example` to `.env`. `.env` is gitignored and is loaded by the local server and command-line pipeline.

```sh
cp .env.example .env
```

### One LLM for all agents

```bash
AGENT_MODEL_MODE=single
LLM_PROVIDER=openai-compatible
LLM_MODEL=your-model-name
LLM_API_KEY=your-key
LLM_BASE_URL=https://your-provider.example/v1
```

### Three LLM configurations

Set `AGENT_MODEL_MODE=separate`, then supply `ORCHESTRATOR_*`, `UX_CRITIQUE_*`, and `VARIANT_GENERATOR_*` values. Any blank role-specific value inherits the shared `LLM_*` value. This permits three different providers/models or one model with agent-specific configuration.

For a local Ollama role, set that role's provider to `ollama`, its base URL to `http://127.0.0.1:11434`, and leave its API key blank.

### Command-line multi-agent run

With `.env` configured, run:

```sh
npm run pipeline -- --input figma_input.json --context "Optional task context"
```

The command validates every stage before writing:

```text
ux_audit.json
src/variants/VariantA.jsx
src/variants/VariantB.jsx
```

If a supervisor response, audit response, or generated component fails validation, no output artifact is written.

No browser code receives provider credentials. A production deployment should store managed or BYOK credentials in a secrets manager/KMS and use them solely from the backend. Never commit keys, Figma access tokens, request logs containing source JSON, or generated customer exports.

## Architecture

```text
Figma JSON upload/paste → normalizer + deterministic rules
                                  ↓
                     Supervisor LLM validation checkpoint
                                  ↓
                         UX Critique LLM → ux_audit.json
                                  ↓
                   Variant Generator LLM → React/Tailwind variants
```

The present prototype includes the normalizer/rules layer, local sandbox fallback, LLM provider adapter, sequential orchestration, schema validation, and CLI artifact writer. The next stages are:

1. Add Figma MCP/OAuth ingestion with server-side token handling.
2. Add color/contrast extraction and deeper WCAG 2.2 checks.
3. Render findings over a visual frame preview using node bounds.
4. Add authentication, quotas, and encrypted tenant-level BYOK storage for hosted use.
5. Add an isolated React preview/build process for generated variants.
6. Add curated evaluation fixtures and regression scoring for each UX framework.

## Public-repository safety

- Keep `.env` and all keys untracked.
- Publish `.env.example` only, with blank values.
- Run the development server locally; it is not an authenticated production API.
- Treat Figma JSON as potentially sensitive design data.
- Before hosting, add authentication, tenant authorization, request rate limits, encrypted secret storage, audit logs, CSP headers, and outbound-request restrictions for custom model endpoints.
