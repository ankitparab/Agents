import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluateFigmaTree } from "./src/evaluator.js";
import { runPipeline, validateFigmaInput } from "./src/pipeline.js";
import { loadLocalEnv } from "./src/env.js";

await loadLocalEnv();

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputPath = argument("--input");
const context = argument("--context") || "";
if (!inputPath) throw new Error("Usage: npm run pipeline -- --input figma_input.json [--context \"Optional task context\"]");

const figma = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const root = validateFigmaInput(figma);
const deterministic = evaluateFigmaTree(root);
const result = await runPipeline({ figma: root, context, deterministicFindings: deterministic.findings });

const auditPath = resolve("ux_audit.json");
const variantsDirectory = resolve("src/variants");
await mkdir(variantsDirectory, { recursive: true });
await writeFile(auditPath, `${JSON.stringify(result.audit, null, 2)}\n`, "utf8");
await writeFile(resolve(variantsDirectory, "VariantA.jsx"), `${result.variants.variantA}\n`, "utf8");
await writeFile(resolve(variantsDirectory, "VariantB.jsx"), `${result.variants.variantB}\n`, "utf8");
console.log(`Validated multi-agent run complete.\n- ${auditPath}\n- ${resolve(variantsDirectory, "VariantA.jsx")}\n- ${resolve(variantsDirectory, "VariantB.jsx")}`);
