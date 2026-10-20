import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateFigmaTree } from "../src/evaluator.js";

test("checkout fixture returns traceable UX findings", async () => {
  const fixture = JSON.parse(await readFile(new URL("../public/fixture.json", import.meta.url)));
  const result = evaluateFigmaTree(fixture);
  const frameworks = new Set(result.findings.map((finding) => finding.framework));
  assert.ok(result.riskScore > 0);
  assert.ok(frameworks.has("Hick's Law"));
  assert.ok(frameworks.has("Fitts's Law"));
  assert.ok(frameworks.has("Von Restorff Effect"));
  assert.ok(result.findings.every((finding) => finding.nodeIds.length > 0 && finding.recommendation));
});
