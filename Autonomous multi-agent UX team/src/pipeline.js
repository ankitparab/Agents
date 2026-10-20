import { askModel, parseJsonObject } from "./llm.js";

const severity = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export function validateFigmaInput(input) {
  const root = input?.document || input?.root || input?.data?.document || input;
  if (!root || typeof root !== "object" || !root.id || !root.type) throw new Error("Input must contain a Figma document or node with id and type.");
  return root;
}

function validateSupervisorReview(review) {
  if (!review || !["APPROVED", "REJECTED"].includes(review.status) || typeof review.input_summary !== "string" || !Array.isArray(review.validation_notes)) {
    throw new Error("Supervisor review must include APPROVED|REJECTED status, input_summary, and validation_notes.");
  }
  return review;
}

export function validateAudit(audit) {
  if (!audit || !Number.isFinite(audit.overall_ux_score) || audit.overall_ux_score < 0 || audit.overall_ux_score > 100) throw new Error("ux_audit.json must include overall_ux_score from 0 to 100.");
  if (!Array.isArray(audit.heuristic_violations) || !Array.isArray(audit.key_recommendations)) throw new Error("ux_audit.json requires heuristic_violations and key_recommendations arrays.");
  for (const violation of audit.heuristic_violations) {
    if (!["heuristic_name", "severity", "layer_id_or_name", "issue_description", "fix"].every((field) => typeof violation[field] === "string" && violation[field].trim())) throw new Error("Each violation must include every required string field.");
    if (!severity.has(violation.severity)) throw new Error("Violation severity must be LOW, MEDIUM, HIGH, or CRITICAL.");
  }
  if (!audit.key_recommendations.every((item) => typeof item === "string" && item.trim())) throw new Error("key_recommendations must contain non-empty strings.");
  return audit;
}

export function validateVariantCode(code, name) {
  if (typeof code !== "string" || code.length < 120) throw new Error(`${name} must be a non-empty React component.`);
  if (!new RegExp(`export\\s+default\\s+function\\s+${name}\\s*\\(`).test(code)) throw new Error(`${name} must default-export function ${name}().`);
  if (/\bstyle\s*=\s*\{/.test(code) || /from\s+["']\.\/.*\.css/.test(code)) throw new Error(`${name} may use Tailwind classes only; inline and external CSS are not allowed.`);
  if (!/className=/.test(code)) throw new Error(`${name} must use Tailwind className values.`);
  return code;
}

const auditSystem = `You are AGENT 2, a UX Critique & Visual Audit Agent. Review only supplied Figma data and deterministic evidence. Apply Nielsen Norman heuristics, WCAG 2.2 AA, 44x44 touch targets, Fitts's Law, Hick's Law, cognitive-load heuristics, Gestalt Proximity, and Von Restorff. Do not invent nodes or claim pixel/contrast facts not present. Return exactly one JSON object matching: {"overall_ux_score":number,"heuristic_violations":[{"heuristic_name":string,"severity":"LOW|MEDIUM|HIGH|CRITICAL","layer_id_or_name":string,"issue_description":string,"fix":string}],"key_recommendations":[string]}.`;
const variantsSystem = `You are AGENT 3, a senior React 18 and design-system engineer. Generate one complete, accessible, interactive flow component from the supplied Figma data and validated UX audit. Return exactly JSON: {"code":string}. The code value must begin exactly with the requested export signature, for example: export default function VariantA() {. Do not use "export default VariantA" and do not rename the requested component. Use React functional components and hooks only where interaction needs state, Tailwind className values only, no inline styles or external CSS, and lucide-react for icons if needed. Keep the component under 100 lines while preserving a complete, usable flow.`;
const supervisorSystem = `You are AGENT 1, the Orchestrator / Supervisor Agent. You inspect a validated Figma root and deterministic evidence before any downstream work. Confirm that the hierarchy is usable for review, identify missing evidence without inventing design facts, and enforce draft-and-review safety. Return exactly JSON: {"status":"APPROVED|REJECTED","input_summary":string,"validation_notes":[string]}. Return REJECTED only if the input cannot be responsibly reviewed.`;

async function askForValidatedJson(role, system, user, validate) {
  let raw = await askModel(role, { system, user });
  try {
    return validate(parseJsonObject(raw));
  } catch (firstError) {
    raw = await askModel(role, {
      system,
      user: `${user}\n\nYour previous response failed validation: ${firstError.message}\nReturn one corrected JSON object only. Preserve the requested schema and use no markdown.`
    });
    return validate(parseJsonObject(raw));
  }
}

export async function runPipeline({ figma, context = "", deterministicFindings = [] }) {
  const root = validateFigmaInput(figma);
  const supervisorInput = JSON.stringify({ task_context: context || "Not supplied", figma_root: root, deterministic_findings: deterministicFindings });
  const supervisor = await askForValidatedJson("orchestrator", supervisorSystem, supervisorInput, validateSupervisorReview);
  if (supervisor.status === "REJECTED") throw new Error(`Supervisor rejected the input: ${supervisor.validation_notes.join(" ")}`);
  const critiqueInput = JSON.stringify({ task_context: context || "Not supplied", figma_root: root, deterministic_findings: deterministicFindings });
  const audit = await askForValidatedJson("critique", auditSystem, critiqueInput, validateAudit);
  const variantInput = { task_context: context || "Not supplied", figma_root: root, ux_audit: audit };
  const variantA = await askForValidatedJson("variants", variantsSystem, JSON.stringify({ ...variantInput, variant: "VariantA", required_export_signature: "export default function VariantA() {", objective: "Minimal Friction Flow: optimize for speed, zero visual clutter, strict alignment, and maximum accessibility." }), (candidate) => {
    validateVariantCode(candidate.code, "VariantA");
    return candidate;
  });
  const variantB = await askForValidatedJson("variants", variantsSystem, JSON.stringify({ ...variantInput, variant: "VariantB", required_export_signature: "export default function VariantB() {", objective: "Behavioral / Nudge Flow: optimize for high-intent conversion, progressive disclosure, clear visual pacing, high-contrast primary actions, and ethical non-coercive nudges." }), (candidate) => {
    validateVariantCode(candidate.code, "VariantB");
    return candidate;
  });
  return { supervisor, audit, variants: { variantA: variantA.code, variantB: variantB.code } };
}
