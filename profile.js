/*
  profile.js — the learner's "data tab": everything we know about them, plus a
  standing AI analysis of strengths and what to work on.

  Two ideas keep this honest and fast:
    1. The hard data (every completed run + its full action timeline) comes
       straight from LearnerStore — the same append-only log the rest of the app
       trusts. Nothing here invents numbers.
    2. The AI ANALYSIS is precomputed in the BACKGROUND after every finished
       lesson (see review.finishLesson) and cached in localStorage. So opening
       the profile shows an instant, already-written analysis — the model call
       never blocks the user, and they never see it happen. When they open the
       tab we also kick a silent refresh if new lessons happened since.
*/
(function (LT) {
  "use strict";

  const els = LT.els;
  const { escapeHtml } = LT;

  const KEY = "london-tutor:analysis:v1";

  // ---- Cache (the precomputed analysis) ----
  function getCached() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function setCached(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (_) { /* fail soft */ }
  }

  // The cache is "stale" if it was built from fewer lessons than we now have
  // (or doesn't exist yet). That's the trigger for a silent refresh.
  function isStale() {
    const c = getCached();
    return !c || (c.lessons || 0) < LearnerStore.history().length;
  }

  /*
    Recompute the analysis from the WHOLE history and cache it. This is
    fire-and-forget: it fails soft (model offline / bad JSON just leaves the
    last good analysis in place) and is never awaited by the UI.
  */
  async function refreshAnalysis() {
    const history = LearnerStore.history();
    if (!history.length) return;

    const h = await LLM.health();
    if (!h.ok) return; // silent: keep whatever we had

    const res = await LLM.generateJSON(buildAnalysisPrompt(history), { maxTokens: 600, temperature: 0.4 });
    if (!res.ok || !res.data) return; // silent

    setCached({ ts: Date.now(), lessons: history.length, data: res.data });
    // If the learner happens to be looking at the profile right now, refresh it.
    if (LT.screens.profile && !LT.screens.profile.hidden) renderProfile();
  }

  function buildAnalysisPrompt(history) {
    // Compact, oldest-first so the model can read a trajectory. We send summaries
    // (not raw timelines) to keep it focused; the UI shows the raw detail.
    const runs = history.slice().reverse().map((e) => ({
      title: e.title,
      mastery: e.mastery,
      checks: `${e.checksCorrect}/${e.checksTotal}`,
      moves: e.movesTotal ? `${e.firstTryCorrect}/${e.movesTotal} first try` : "n/a",
      durationSec: e.durationSec,
      actions: e.totalActions || 0,
      misconceptions: e.misconceptions || [],
    }));
    const stats = LearnerStore.stats();

    const system =
      "You are an expert, warm learning coach. You are given a student's ENTIRE history across multiple " +
      "lessons (oldest first) and derived stats. Find GENUINE patterns across lessons: what they consistently " +
      "do well, recurring misconceptions or weak spots, and their trajectory over time. Be specific and ground " +
      "EVERYTHING strictly in the data — never invent lessons, scores, or mistakes. Speak TO the learner ('you'). " +
      'Reply with ONLY a JSON object: {"summary": string (2-3 sentences on where they stand), ' +
      '"strengths": [string, ...] (1-4), "improve": [string, ...] (1-4 concrete weak spots to work on), ' +
      '"recommendation": string (one concrete next focus)}.';
    const user = "STATS:\n" + JSON.stringify(stats) + "\n\nRUNS (oldest first):\n" + JSON.stringify(runs);

    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  // ---- The profile screen ----
  // Open from the header: render cached data instantly, then silently refresh
  // the analysis if new lessons have happened since it was last written.
  function open() {
    LT.show("profile");
    renderProfile();
    if (isStale()) refreshAnalysis(); // background; renderProfile re-runs when done
  }

  function renderProfile() {
    if (!els.profileBody) return;
    const stats = LearnerStore.stats();
    const history = LearnerStore.history();

    if (!history.length) {
      els.profileBody.innerHTML = emptyState();
      wireBack();
      return;
    }

    els.profileBody.innerHTML = `
      <div class="text-center mb-6">
        <p class="text-brand-400 font-semibold text-sm uppercase tracking-widest mb-1">Your profile</p>
        <h1 class="display text-3xl font-extrabold text-white">Learning data &amp; analysis</h1>
      </div>

      ${statsRow(stats)}
      ${analysisCard()}

      <h2 class="text-white font-semibold mt-8 mb-3">All lessons (${history.length})</h2>
      <div class="space-y-2">${history.map(runCard).join("")}</div>

      <div class="flex justify-center mt-8">
        <button id="profile-back" class="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 active:translate-y-px text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-brand-500/20">
          Back to learning <span aria-hidden="true">&rarr;</span>
        </button>
      </div>`;

    wireBack();
  }

  function wireBack() {
    const back = document.getElementById("profile-back");
    if (back) back.addEventListener("click", () => { LT.show("welcome"); LT.renderProgress(); });
  }

  function masteryColor(p) { return p >= 80 ? "text-green-400" : p >= 50 ? "text-amber-400" : "text-red-400"; }

  function statsRow(stats) {
    const trend = stats.trend == null
      ? `<span class="text-slate-500 text-xs">building a trend…</span>`
      : stats.trend >= 0
        ? `<span class="text-green-400 text-xs font-semibold">&#9650; +${stats.trend} pts</span>`
        : `<span class="text-amber-400 text-xs font-semibold">&#9660; ${stats.trend} pts</span>`;
    return `
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl bg-slate-900 border border-white/5 p-4 text-center">
          <div class="text-3xl font-extrabold text-white tabular-nums">${stats.lessons}</div>
          <div class="text-xs text-slate-400 mt-0.5">lessons done</div>
        </div>
        <div class="rounded-xl bg-slate-900 border border-white/5 p-4 text-center">
          <div class="text-3xl font-extrabold ${masteryColor(stats.avgMastery)} tabular-nums">${stats.avgMastery}%</div>
          <div class="text-xs text-slate-400 mt-0.5">avg mastery</div>
        </div>
        <div class="rounded-xl bg-slate-900 border border-white/5 p-4 flex flex-col items-center justify-center text-center">
          ${trend}
          <div class="text-xs text-slate-400 mt-0.5">recent vs. earlier</div>
        </div>
      </div>`;
  }

  // The standing AI analysis (precomputed in the background).
  function analysisCard() {
    const c = getCached();
    const head = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-white font-semibold flex items-center gap-2">
          <span class="text-brand-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5" aria-hidden="true"><path d="M12 3a4 4 0 0 1 4 4c0 1.3-.6 2.4-1.5 3.2.9.7 1.5 1.8 1.5 3.1a4 4 0 0 1-8 0c0-1.3.6-2.4 1.5-3.1A4 4 0 0 1 8 7a4 4 0 0 1 4-4Z"/><path d="M12 17v4M9 21h6"/></svg>
          </span>
          AI analysis
        </h3>
        ${c ? `<span class="text-xs text-slate-500">based on ${c.lessons} lesson${c.lessons === 1 ? "" : "s"} &middot; ${timeAgo(c.ts)}</span>` : ""}
      </div>`;

    if (!c) {
      return `<div class="rounded-2xl bg-slate-900 border border-white/5 p-5 mt-3">
        ${head}
        <p class="text-sm text-slate-400">Your analysis is being prepared in the background — finish a lesson (or check back in a moment) and it'll appear here automatically.</p>
      </div>`;
    }

    const d = c.data || {};
    return `
      <div class="rounded-2xl bg-slate-900 border border-white/5 p-5 mt-3">
        ${head}
        <p class="text-slate-200 leading-relaxed">${escapeHtml(d.summary || "")}</p>
        <div class="grid sm:grid-cols-2 gap-5 mt-5">
          <div>
            <h4 class="text-green-400 font-semibold text-sm mb-2 flex items-center gap-1.5"><span>&#10003;</span> Doing well</h4>
            <ul class="space-y-1.5 text-sm text-slate-300">${list(d.strengths, "text-green-500")}</ul>
          </div>
          <div>
            <h4 class="text-amber-400 font-semibold text-sm mb-2 flex items-center gap-1.5"><span>&#9650;</span> Work on</h4>
            <ul class="space-y-1.5 text-sm text-slate-300">${list(d.improve, "text-amber-500")}</ul>
          </div>
        </div>
        ${d.recommendation ? `<div class="mt-5 rounded-xl bg-brand-500/10 border border-brand-500/30 px-4 py-3">
          <p class="text-sm text-brand-200"><span class="font-semibold">Focus next:</span> ${escapeHtml(d.recommendation)}</p>
        </div>` : ""}
      </div>`;
  }

  // One completed run — collapses open to reveal the FULL action timeline
  // (everything we tracked for that lesson).
  function runCard(e) {
    const checks = `${e.checksCorrect}/${e.checksTotal} checks`;
    const moves = e.movesTotal ? ` &middot; ${e.firstTryCorrect}/${e.movesTotal} moves first try` : "";
    const miss = (e.misconceptions || []).length
      ? `<p class="text-xs text-amber-400/90 mt-1">Weak spots: ${(e.misconceptions || []).map(escapeHtml).join(", ")}</p>`
      : "";
    return `
      <details class="rounded-xl bg-slate-900 border border-white/5 overflow-hidden group">
        <summary class="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3">
          <span class="min-w-0">
            <span class="text-slate-200 font-medium block truncate">${escapeHtml(e.title)}</span>
            <span class="text-xs text-slate-500">${timeAgo(e.ts)} &middot; ${checks}${moves} &middot; ${e.durationSec}s &middot; ${e.totalActions || 0} actions tracked</span>
          </span>
          <span class="flex items-center gap-2 shrink-0">
            <span class="text-sm font-bold ${masteryColor(e.mastery)} tabular-nums">${e.mastery}%</span>
            <span class="text-slate-600 group-open:rotate-180 transition">&#9662;</span>
          </span>
        </summary>
        <div class="px-4 pb-4">
          ${miss}
          ${timelineTable(e.timeline || [])}
        </div>
      </details>`;
  }

  function timelineTable(events) {
    if (!events.length) return `<p class="text-xs text-slate-500 mt-2">No detailed timeline stored for this run.</p>`;
    const rows = events.map((ev) => {
      const secs = (ev.t / 1000).toFixed(1) + "s";
      const { t, type, ...rest } = ev;
      const detail = Object.entries(rest).map(([k, v]) => `${k}=${escapeHtml(String(v))}`).join(" ");
      return `<tr class="border-t border-white/5">
        <td class="py-1 pr-3 text-slate-500 tabular-nums whitespace-nowrap">${secs}</td>
        <td class="py-1 pr-3 font-medium text-slate-300 whitespace-nowrap">${escapeHtml(type)}</td>
        <td class="py-1 text-slate-400">${detail}</td>
      </tr>`;
    }).join("");
    return `<div class="mt-2 max-h-72 overflow-y-auto rounded-lg bg-slate-950/40 border border-white/5 px-3 py-2">
      <table class="w-full text-xs"><tbody>${rows}</tbody></table>
    </div>`;
  }

  function emptyState() {
    return `
      <div class="text-center pt-10">
        <p class="text-brand-400 font-semibold text-sm uppercase tracking-widest mb-1">Your profile</p>
        <h1 class="display text-3xl font-extrabold text-white mb-3">No data yet</h1>
        <p class="text-slate-400 mb-8 max-w-md mx-auto">Finish your first lesson and this page fills with your full history and an AI analysis of what you're doing well and what to work on.</p>
        <button id="profile-back" class="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 active:translate-y-px text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-brand-500/20">
          Start learning <span aria-hidden="true">&rarr;</span>
        </button>
      </div>`;
  }

  // ---- small helpers ----
  function list(arr, dotClass) {
    const items = Array.isArray(arr) ? arr : (arr ? [arr] : []);
    if (!items.length) return `<li class="text-slate-500">\u2014</li>`;
    return items.map((t) =>
      `<li class="flex gap-2"><span class="${dotClass} mt-0.5">&bull;</span><span>${escapeHtml(String(t))}</span></li>`
    ).join("");
  }
  function timeAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // Public surface.
  LT.Profile = { open, renderProfile, refreshAnalysis };
})(window.LT);
