import test from "node:test";
import assert from "node:assert/strict";
import { validateAudit, validateFigmaInput, validateVariantCode } from "../src/pipeline.js";

test("supervisor input validation accepts a Figma-like root", () => {
  assert.equal(validateFigmaInput({ id: "1:2", type: "FRAME" }).id, "1:2");
  assert.throws(() => validateFigmaInput({ type: "FRAME" }), /id and type/);
});

test("audit schema and generated variants are checked before writing", () => {
  const audit = validateAudit({
    overall_ux_score: 72,
    heuristic_violations: [{ heuristic_name: "Hick's Law", severity: "HIGH", layer_id_or_name: "menu", issue_description: "Five choices", fix: "Group choices" }],
    key_recommendations: ["Group secondary actions"]
  });
  assert.equal(audit.overall_ux_score, 72);
  const code = "export default function VariantA() { return <main className=\"mx-auto max-w-lg rounded-xl p-6\"><h1 className=\"text-xl font-bold\">Continue</h1><button className=\"rounded bg-indigo-600 px-4 py-3 text-white\">Continue</button></main>; }";
  assert.equal(validateVariantCode(code, "VariantA"), code);
  assert.throws(() => validateVariantCode("export default function VariantA(){ return <div style={{}} />; }", "VariantA"));
});
