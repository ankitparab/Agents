const MIN_TOUCH_TARGET = 24;
const RECOMMENDED_TOUCH_TARGET = 44;
const MAX_UNCHUNKED_CHOICES = 4;

const HEURISTICS = {
  hick: "Hick's Law",
  miller: "Cognitive load (Miller's Law)",
  vonRestorff: "Von Restorff Effect",
  gestalt: "Gestalt Proximity",
  wcag: "WCAG 2.2",
  fitts: "Fitts's Law"
};

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function flattenFigma(node, parent = null, output = []) {
  if (!node || typeof node !== "object") return output;
  const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds || {};
  output.push({
    id: node.id || `node-${output.length}`,
    name: node.name || "Unnamed layer",
    type: node.type || "UNKNOWN",
    characters: node.characters || "",
    visible: node.visible !== false,
    x: number(bounds.x),
    y: number(bounds.y),
    width: number(bounds.width),
    height: number(bounds.height),
    fills: Array.isArray(node.fills) ? node.fills : [],
    strokes: Array.isArray(node.strokes) ? node.strokes : [],
    parentId: parent?.id || null,
    parentName: parent?.name || null,
    parentType: parent?.type || null,
    raw: node
  });
  for (const child of node.children || []) flattenFigma(child, node, output);
  return output;
}

function isText(node) {
  return node.type === "TEXT" && node.characters.trim().length > 0;
}

function isInteractive(node) {
  const label = `${node.name} ${node.characters}`.toLowerCase();
  return /button|cta|submit|continue|cancel|save|next|back|link|input|field|select|checkbox|radio|toggle/.test(label) ||
    ["INSTANCE", "COMPONENT", "COMPONENT_SET"].includes(node.type) && /button|input|select|checkbox|radio/.test(label);
}

function isPrimaryAction(node) {
  return /primary|continue|submit|save|next|confirm|pay|checkout|get started/i.test(`${node.name} ${node.characters}`);
}

function isLabel(node) {
  return isText(node) && /email|password|name|address|phone|card|number|date|search|label/i.test(node.characters);
}

function isInput(node) {
  return /input|field|email|password|select|dropdown|checkbox|radio|search/i.test(`${node.name} ${node.type}`) && !isText(node);
}

function severity(score) {
  if (score >= 9) return "critical";
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function finding({ framework, nodeIds, score, evidence, explanation, recommendation, kind = "measured" }) {
  return {
    id: `${framework}-${nodeIds.join("-")}`,
    framework,
    category: framework === HEURISTICS.wcag ? "accessibility" : "usability",
    kind,
    severity: severity(score),
    score,
    nodeIds,
    evidence,
    explanation,
    recommendation
  };
}

function distance(a, b) {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

export function evaluateFigmaTree(root) {
  const nodes = flattenFigma(root).filter((node) => node.visible);
  const findings = [];
  const interactive = nodes.filter(isInteractive);
  const textNodes = nodes.filter(isText);

  for (const node of interactive) {
    const smallestSide = Math.min(node.width, node.height);
    if (smallestSide > 0 && smallestSide < MIN_TOUCH_TARGET) {
      findings.push(finding({
        framework: HEURISTICS.wcag,
        nodeIds: [node.id],
        score: 8,
        evidence: { width: node.width, height: node.height, minimum: MIN_TOUCH_TARGET },
        explanation: `“${node.name}” is smaller than the 24px WCAG target-size minimum.`,
        recommendation: `Increase the control to at least ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}px; use ${RECOMMENDED_TOUCH_TARGET}px for a more forgiving mobile target.`
      }));
    } else if (smallestSide > 0 && smallestSide < RECOMMENDED_TOUCH_TARGET) {
      findings.push(finding({
        framework: HEURISTICS.fitts,
        nodeIds: [node.id],
        score: 3,
        evidence: { width: node.width, height: node.height, recommended: RECOMMENDED_TOUCH_TARGET },
        explanation: `“${node.name}” is a relatively small interaction target, raising acquisition effort.`,
        recommendation: `Consider a ${RECOMMENDED_TOUCH_TARGET}px target or increase spacing around it.`
      }));
    }
  }

  const peerGroups = new Map();
  for (const node of interactive) {
    if (!node.parentId) continue;
    const list = peerGroups.get(node.parentId) || [];
    list.push(node);
    peerGroups.set(node.parentId, list);
  }
  for (const [parentId, group] of peerGroups) {
    if (group.length > MAX_UNCHUNKED_CHOICES) {
      findings.push(finding({
        framework: HEURISTICS.hick,
        nodeIds: group.map((node) => node.id),
        score: 6,
        evidence: { choiceCount: group.length, unchunkedThreshold: MAX_UNCHUNKED_CHOICES, parentId },
        explanation: `${group.length} peer actions appear together without an observable grouping structure, increasing decision time.`,
        recommendation: "Chunk related choices, establish a clear default, or progressively disclose lower-priority options.",
        kind: "likely"
      }));
    }
  }

  const totalWords = textNodes.reduce((count, node) => count + node.characters.trim().split(/\s+/).filter(Boolean).length, 0);
  const textDensity = totalWords / Math.max(1, nodes.filter((node) => node.width > 0 && node.height > 0).length);
  if (totalWords > 120 || textDensity > 16) {
    findings.push(finding({
      framework: HEURISTICS.miller,
      nodeIds: textNodes.map((node) => node.id),
      score: totalWords > 220 ? 7 : 4,
      evidence: { visibleWordCount: totalWords, textDensity: Number(textDensity.toFixed(1)) },
      explanation: `This screen exposes ${totalWords} visible words at once, which may overload working memory during a task.`,
      recommendation: "Lead with the decision-critical content, group instructions near actions, and disclose secondary detail on demand.",
      kind: "likely"
    }));
  }

  const primary = interactive.filter(isPrimaryAction);
  for (const action of primary) {
    const siblings = interactive.filter((candidate) => candidate.parentId === action.parentId && candidate.id !== action.id);
    if (!siblings.length) continue;
    const sameSize = siblings.some((candidate) => Math.abs(candidate.width - action.width) < 4 && Math.abs(candidate.height - action.height) < 4);
    const sameFill = siblings.some((candidate) => JSON.stringify(candidate.fills) === JSON.stringify(action.fills));
    if (sameSize && sameFill) {
      findings.push(finding({
        framework: HEURISTICS.vonRestorff,
        nodeIds: [action.id, ...siblings.map((node) => node.id)],
        score: 5,
        evidence: { sameFill, sameSize, siblingCount: siblings.length },
        explanation: `The primary action “${action.name}” has the same visual treatment as peer actions.`,
        recommendation: "Give the primary CTA a distinct semantic fill, stronger contrast, or more prominent placement; reduce secondary actions to lower-emphasis treatments.",
        kind: "likely"
      }));
    }
  }

  const labels = nodes.filter(isLabel);
  const inputs = nodes.filter(isInput);
  for (const label of labels) {
    const closest = inputs.map((input) => ({ input, d: distance(label, input) })).sort((a, b) => a.d - b.d)[0];
    if (closest && closest.d > 84) {
      findings.push(finding({
        framework: HEURISTICS.gestalt,
        nodeIds: [label.id, closest.input.id],
        score: 4,
        evidence: { labelToInputDistance: Math.round(closest.d), maximumRecommendedDistance: 84 },
        explanation: `The label “${label.characters}” is structurally distant from its nearest likely input.`,
        recommendation: "Place the label immediately above or beside its input and wrap each pair in a shared layout group.",
        kind: "likely"
      }));
    }
  }

  return {
    nodeCount: nodes.length,
    findings: findings.sort((a, b) => b.score - a.score),
    riskScore: Math.min(100, findings.reduce((sum, item) => sum + item.score, 0)),
    ruleCoverage: Object.values(HEURISTICS)
  };
}
