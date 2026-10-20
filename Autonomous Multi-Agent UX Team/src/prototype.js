function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

export function createPrototype({ variant, context, findings }) {
  const isBehavioral = variant === "behavioral";
  const title = isBehavioral ? "A clearer path, with confidence" : "Complete your task";
  const summary = isBehavioral
    ? "A guided flow with transparent progress, helpful reassurance, and a clear choice at every step."
    : "A focused, accessible flow that removes non-essential decisions and gets out of the way.";
  const fixes = findings.slice(0, 3).map((item) => item.framework).join(", ") || "accessible defaults";
  const emphasis = isBehavioral ? "bg-indigo-600 hover:bg-indigo-700" : "bg-slate-900 hover:bg-slate-800";
  const reassurance = isBehavioral ? "Join 12,000 people who completed this step this week." : "You can review and change your choices before confirming.";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script><title>${escapeHtml(title)}</title></head>
<body class="min-h-screen bg-slate-50 text-slate-950"><main class="mx-auto max-w-lg px-5 py-10">
  <p class="mb-6 text-sm font-medium text-slate-600">${isBehavioral ? "Step 2 of 3 · About two minutes" : "Secure, accessible flow"}</p>
  <section class="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
    <h1 class="text-3xl font-bold tracking-tight">${escapeHtml(title)}</h1>
    <p class="mt-3 leading-6 text-slate-600">${escapeHtml(summary)}</p>
    <form class="mt-8 space-y-5" onsubmit="event.preventDefault(); document.getElementById('success').classList.remove('hidden')">
      <div><label for="name" class="mb-2 block text-sm font-semibold">Your name</label><input id="name" required class="h-12 w-full rounded-xl border border-slate-300 px-4 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100" placeholder="Name"></div>
      <div><label for="email" class="mb-2 block text-sm font-semibold">Email address</label><input id="email" type="email" required class="h-12 w-full rounded-xl border border-slate-300 px-4 focus:border-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100" placeholder="you@example.com"></div>
      <button class="h-12 w-full rounded-xl px-5 font-semibold text-white transition ${emphasis}">Continue</button>
      <button type="button" class="h-12 w-full rounded-xl px-5 font-semibold text-slate-700 underline underline-offset-4">Save and finish later</button>
    </form>
    <p class="mt-6 text-sm leading-5 text-slate-600">${escapeHtml(reassurance)}</p>
    <p id="success" class="mt-5 hidden rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Saved. The next step is ready.</p>
  </section>
  <aside class="mt-6 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600"><strong>Design intent:</strong> This prototype addresses ${escapeHtml(fixes)}. ${context ? `Inferred context: ${escapeHtml(context)}.` : ""}</aside>
</main></body></html>`;
}
