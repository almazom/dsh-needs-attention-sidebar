import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveState, deriveRow, stateRowFor, reduceEvents, scanSessions } from "../src/scanner.mjs";

/* Plan plans/2026-11-05_needs-attention-states.md S1 — ordered taxonomy v2 table.
   Grounded: S0 spike (TC-001) confirmed the JSON path data.reason.reason.kind on
   8 live logs (aborted:user x6, aborted:disposed x1, max-tokens x1). */

test("TC-005 AC1: deriveState matrix — every kind lands in exactly one group", () => {
  const cases = [
    [{ kind: "completed" }, "ok"],
    [{ kind: "blocked" }, "look"],
    [{ kind: "max-tokens" }, "look"],
    [{ kind: "aborted", cause: "hook" }, "look"],
    [{ kind: "aborted", cause: "user" }, "stopped"],
    [{ kind: "aborted", cause: "parent" }, "stopped"],
    [{ kind: "aborted", cause: "disposed" }, null],
    [{ kind: "aborted", cause: "legacy" }, null],
    [{ kind: "aborted", cause: null }, null], // no cause parsed -> never guess
    [{ kind: "forked" }, null],
    [{ kind: "error" }, null], // error family stays in errors[] (Nielsen: one meaning per surface)
    [{ kind: "interrupted" }, null],
    [{ kind: "unknown-future-kind" }, null],
  ];
  for (const [ev, want] of cases) {
    assert.equal(deriveState(ev), want, `deriveState(${JSON.stringify(ev)})`);
  }
});

test("TC-005 AC1b: interrupted belongs to error rows, not to states", () => {
  assert.equal(deriveRow("session-i", [{ time: 1, kind: "interrupted", message: "x" }], "T") !== null, true);
});

test("TC-005 AC2: stateRowFor derives {id,state,kind,cause,at} with redacted title", () => {
  const row = stateRowFor("session-abc", [
    { time: 1, kind: "completed", message: "turn completed" },
    { time: 2, kind: "aborted", message: "turn aborted", cause: "user" },
  ], "My Title");
  assert.equal(row.state, "stopped");
  assert.equal(row.kind, "aborted");
  assert.equal(row.cause, "user");
  assert.equal(row.at, 2);
  assert.equal(row.title, "My Title");
  assert.equal(stateRowFor("session-abc", [{ time: 1, kind: "completed", message: "" }], null).state, "ok");
  assert.equal(stateRowFor("session-abc", [], null), null, "no events -> no state row");
});

test("TC-005 AC3: reduceEvents retains the abort cause (data.reason.reason.kind)", () => {
  const ring = reduceEvents();
  ring.push({ type: "turn/end", time: 1793862599982, data: { turn: 4, reason: { kind: "aborted", reason: { kind: "user" } } } });
  const { events } = ring.result();
  assert.equal(events[0].kind, "aborted");
  assert.equal(events[0].cause, "user", "nested cause must survive into the ring");
  const flat = reduceEvents();
  flat.push({ type: "turn/end", time: 1, data: { reason: { kind: "max-tokens" } } });
  assert.equal(flat.result().events[0].cause, null, "flat kinds have cause null");
});

test("TC-005 AC4: envelope always carries states {working,waiting,ok,look,stopped,totals} — even on a degraded root", async () => {
  const prevRoot = process.env.DSH_NEEDS_ATTN_LOG_ROOT;
  process.env.DSH_NEEDS_ATTN_LOG_ROOT = "/nonexistent-needs-attention-root-xyz";
  try {
    const out = await scanSessions({ now: Date.now() });
    assert.equal(out.rootOk, false);
    /* F7 pin (TC-001): working/waiting keys joined the envelope — liveness groups. */
    assert.deepEqual(Object.keys(out.states), ["working", "waiting", "ok", "look", "stopped", "totals"]);
    assert.deepEqual(out.states.totals, { ok: 0, look: 0, stopped: 0 });
    assert.deepEqual(out.states.ok, []);
    assert.deepEqual(out.states.working, []);
    assert.deepEqual(out.states.waiting, []);
  } finally {
    if (prevRoot === undefined) delete process.env.DSH_NEEDS_ATTN_LOG_ROOT;
    else process.env.DSH_NEEDS_ATTN_LOG_ROOT = prevRoot;
  }
});

test("TC-005 AC5: hidden kinds can never leak into the envelope (F2 fixture)", () => {
  // aborted:disposed/legacy and forked derive no state row and no error row:
  assert.equal(stateRowFor("session-h", [{ time: 3, kind: "aborted", message: "", cause: "disposed" }], "T"), null);
  assert.equal(stateRowFor("session-h", [{ time: 3, kind: "aborted", message: "", cause: "legacy" }], "T"), null);
  assert.equal(stateRowFor("session-h", [{ time: 3, kind: "forked", message: "" }], "T"), null);
  assert.equal(deriveRow("session-h", [{ time: 3, kind: "forked", message: "" }], "T"), null);
});

/* Client-side behavior is browser-only; per fleet convention (polling.unit.test.mjs)
   the client contract is pinned by source assertions. DOM behavior itself is gated
   by G3 (live browser) + VLM judge acceptance. */
const clientSrc = readFileSync(new URL("../src/client.js", import.meta.url), "utf8");
const hostSrc = readFileSync(new URL("../src/host.mjs", import.meta.url), "utf8");

test("TC-005 AC6: host envelope passes states through (F2)", () => {
  assert.match(hostSrc, /states: Array\.isArray\(out\) \? undefined : out\?\.states \?\? undefined/);
});

test("TC-005 AC7: client strip-states guard degrades to errors-only on an old server (F3)", () => {
  assert.match(clientSrc, /strip-states guard/);
  assert.match(clientSrc, /data\.states && !Array\.isArray\(data\.states\)/);
  assert.match(clientSrc, /pruneDismissed\(rows\.concat\(stateRows\)\)/);
});

test("TC-005 AC8: client renders the two-tab block per approved prototype v3", () => {
  assert.match(clientSrc, /role="tablist"/);
  assert.match(clientSrc, /data-dna-tab="look"/);
  assert.match(clientSrc, /data-dna-tab="done"/);
  assert.match(clientSrc, /aria-selected/);
  assert.match(clientSrc, /unseenDiv: "since your last visit"/); /* TC-001: divider lives in the locale table now */
  assert.match(clientSrc, /dsh\.na\.lastVisit/);
  assert.match(clientSrc, /aria-live", "polite"/);
  assert.match(clientSrc, /var DNA_BUILD = "states34-openwalk"/); /* states34-openwalk = workspace-activate + overflow-expand fallback */
  assert.match(clientSrc, /t !== "look" && t !== "work" && t !== "done"/); /* TC-016: switchTab whitelist accepts "work" — TC-014 added the tab but missed the whitelist */
  assert.match(clientSrc, /\.dna-tab-fin \{ flex:1\.4; \}/); /* TC-015 P3a: Finished-tab width is a class, not an inline style */
  assert.doesNotMatch(clientSrc, /style="flex:1\.4"/); /* TC-015 P3a: inline style removed */
  assert.match(clientSrc, /border-radius:8px; padding:9px 12px/); /* TC-015 P3b: toast joins the 8/12 radius scale */
  var gi = clientSrc.indexOf('if (!items[i].row && !items[i].isState) continue;');
  assert.ok(gi > -1, "TC-013 fix: caption-less group marker must not fall into rowHtml(undefined)");
  var hi = clientSrc.indexOf('<span class="dna-hspace"></span>', clientSrc.indexOf('dna-head')), bi = clientSrc.indexOf('dna-badge dna-b-work">');
  assert.ok(hi > -1 && bi > -1 && hi < bi, "TC-012: hspace must precede badges — blue/green/red aligned right (operator m03011/m03017)");
  var fi = clientSrc.indexOf('T.grpFailed, n: aliveErr.length'), li = clientSrc.indexOf('T.grpLook, n: byState.look.length');
  assert.ok(fi > -1 && li > -1 && fi < li, "TC-011: Failed group must render ABOVE Look (operator m02960, TC-014 Attention = warnings only)");
  /* TC-001 i18n: locale table + zh detection + data-dna-zh hook */
  assert.match(clientSrc, /var I18N = \{/);
  assert.match(clientSrc, /setLocale\(\/\[一-鿿\]\/\.test\(base\) \? "zh" : "en"\)/); /* TC-010: base (cue-suffix-stripped) */
  assert.match(clientSrc, /slice\(0, 40\)/, "toast title pinned");
  assert.match(clientSrc, /dna-pulse 2s ease-in-out infinite/, "working marker: gentle opacity pulse (demo.gif design)");
  assert.ok(!clientSrc.includes("1199.98"), "no viewport MQ: Focus label must never be hidden by width — rail handled by _rail class");
  assert.ok(!clientSrc.includes("opacity:.35"), "dismiss x hidden until hover (demo.gif design)");
  assert.match(clientSrc, /prefers-reduced-motion[^}]*animation:\s*none/, "reduced-motion kills animation");
  assert.match(clientSrc, /data-dna-zh/);
  assert.match(clientSrc, /var warnLen = aliveErr\.length \+ byState\.look\.length \+ byState\.waiting\.length/); /* TC-014: Attention tab counts warnings only */
  assert.match(clientSrc, /sTab === "work"/); /* TC-014: Working has its own items branch */
  assert.match(clientSrc, /data-dna-tab="work"/); /* TC-014: Working tab button */
  assert.match(clientSrc, /T\.tabWork \+ ' ' \+ workCount/); /* TC-014: tab label "Working N" */
  assert.match(clientSrc, /warnLen > 0 \? '<button[^]*data-dna-tab="look"/); /* TC-014: Attention tab zero-hidden */
  assert.match(clientSrc, /workCount > 0 \? '<button[^]*data-dna-tab="work"/); /* TC-014: Working tab zero-hidden */
  assert.match(clientSrc, /savedTab === "work"/); /* TC-014: tab persistence accepts work */
  assert.match(clientSrc, /class="dna-tab dna-tab-fin"/); /* TC-014→TC-015: Finished tab wider via .dna-tab-fin class (inline style removed by P3a) */
  assert.match(clientSrc, /\.dna-group \{ max-height:480px/); /* TC-010: clamp 196→480 — rows stay visible; Workspaces list keeps its own scroll */
  assert.match(clientSrc, /\.dna-badge\.dna-b-work \{ background:#4da3ff; color:#1b1b1c; \}/); /* TC-009: no special margins — head gap 8px governs every header gap */
  assert.match(clientSrc, /\.dna-badge\.dna-b-stop \{ background: var\(--dna-ok\); color:#fff; \}/); /* TC-009 */
  assert.match(clientSrc, /needCount = att\.length - byState\.working\.length/); /* operator 2026-11-06: Working excluded from the badge */
  assert.match(clientSrc, /var workCount = byState\.working\.length/); /* operator 2026-11-06: Focus badge = blue working + red attention */
  assert.match(clientSrc, /dna-label">' \+ T\.focus/); /* operator 2026-11-06: block renamed Needs Attention → Focus */
  assert.match(clientSrc, /dna-badge dna-b-work/); /* blue pill for the working count */
  assert.match(clientSrc, /workCount > 0 \? '<span class="dna-badge dna-b-work">/); /* zero-hidden blue counter */
  assert.match(clientSrc, /var stopCount = byState\.stopped\.length/); /* TC-008: green pill = Stopped-by-you count */
  assert.match(clientSrc, /stopCount > 0 \? '<span class="dna-badge dna-b-stop">/); /* TC-008: zero-hidden green counter */
  assert.match(clientSrc, /dna-hspace[\s\S]{0,200}dna-b-stop/); /* TC-012: spacer now LEFT of all pills — blue/green/red right-aligned */
  assert.match(clientSrc, /dna-b-stop[\s\S]{0,200}dna-alert/); /* TC-008→TC-012: red attention pill rightmost, blinking */
  assert.match(clientSrc, /badgeCls \+ ' dna-alert">'/); /* TC-008: alert glow class on the red pill */
  assert.match(clientSrc, /@keyframes dna-alert/); /* TC-008: glow keyframes */
  assert.match(clientSrc, /prefers-reduced-motion[\s\S]{0,120}dna-alert/); /* TC-008: motion guard */
  assert.match(clientSrc, /data-dna-tick/); /* TC-002: ticking Working rows */
  assert.match(clientSrc, /startTicker/);
  assert.match(clientSrc, /clearInterval\(tickTimer\)/); /* dispose */
  assert.match(clientSrc, /dna-sub-red/); /* operator 2026-11-06: Failed (>0) header paints red */
  assert.match(clientSrc, /danger: aliveErr\.length > 0/);
});

/* ---- v0.3 (plans/2026-11-06_needs-attention-v03.md) ---- */

test("TC-005 AC2: reduceEvents carries the liveness triplets (F6 warm-poll cache)", () => {
  const red = reduceEvents();
  [
    { type: "turn/start", seq: 10, time: 1000, data: { turn: 1 } },
    { type: "turn/end", seq: 11, time: 2000, data: { turn: 1, reason: { kind: "completed" } } },
    { type: "approval/asked", seq: 12, time: 3000, data: { id: "a1", toolName: "bash" } },
    { type: "turn/start", seq: 13, time: 4000, data: { turn: 2 } },
  ].forEach(red.push);
  const r = red.result();
  assert.deepEqual(r.lastTurn, { seq: 13, time: 4000 });
  assert.deepEqual(r.lastApproval, { seq: 12, time: 3000 });
  assert.deepEqual(r.lastEnd, { seq: 11, time: 2000 });
});

test("TC-005 AC2: doScan liveness derivation — source pins (waiting wins, fresh gate, alive exclusion)", () => {
  const src = readFileSync(new URL("../src/scanner.mjs", import.meta.url), "utf8");
  assert.match(src, /const FRESH_MS = 30 \* 60 \* 1000/);
  assert.match(src, /lastApproval\.seq > lastEnd\.seq/); /* F1: waiting > working */
  assert.match(src, /lastTurn\.seq > lastEnd\.seq/); /* open turn = working */
  assert.match(src, /const alive = new Set\(/); /* F8/F9: excluded from every list before totals */
  assert.match(src, /working: working\.slice\(0, STATES_ROW_CAP\)/);
});

test("TC-005 AC2 (review P1): an answered approval is not pending — lastDecision unpins Waiting", () => {
  const src = readFileSync(new URL("../src/scanner.mjs", import.meta.url), "utf8");
  /* approval/decided must be retained and gate the waiting derivation */
  assert.match(src, /t === "approval\/decided"/);
  assert.match(src, /lastApproval\.seq > lastDecision\.seq/);
  const red = reduceEvents();
  [
    { type: "approval/asked", seq: 2787, time: 1000, data: { id: "a1", toolName: "bash" } },
    { type: "approval/decided", seq: 2788, time: 1001, data: { id: "a1" } },
    { type: "turn/start", seq: 2789, time: 1002, data: { turn: 5 } },
    /* turn/end comes ~9 min later (real log df7e15e5): window must read Working, not Waiting */
  ].forEach(red.push);
  const r = red.result();
  assert.deepEqual(r.lastDecision, { seq: 2788, time: 1001 });
  /* approval asked(2787) > end? no end yet, but decided(2788) > asked(2787) → NOT waiting */
  const asked = r.lastApproval, decided = r.lastDecision;
  const approvalNewer = asked && (!r.lastEnd || asked.seq > r.lastEnd.seq) && (!decided || asked.seq > decided.seq);
  assert.equal(approvalNewer, false, "answered approval must not pin Waiting");
});

test("TC-005 AC1: unseen-completion client wiring — source pins", () => {
  assert.match(clientSrc, /var LS_SEEN = "dsh\.na\.seen"/);
  assert.match(clientSrc, /function markSeen\(/);
  assert.match(clientSrc, /function isUnseen\(s\) \{ return !seenMap\[s\.id\] \|\| seenMap\[s\.id\] < s\.at; \}/);
  assert.match(clientSrc, /function pruneSeen\(\)/);
  assert.match(clientSrc, /pruneSeen\(\);/); /* called in render */
  assert.doesNotMatch(clientSrc, /dna-dim/); /* seen done rows stay bright (operator revert 2026-11-09) */
  assert.match(clientSrc, /dna-new/); /* unseen '!' badge */
  assert.match(clientSrc, /markSeen\(row\.getAttribute\("data-dna-id"\)\)/); /* mouse hook */
  /* keyboard hook (F13) — same call inside the keydown branch */
  assert.match(clientSrc, /ev\.preventDefault\(\); markSeen\(row\.getAttribute\("data-dna-id"\)\); openSession/);
});

test("TC-005 AC4: dismiss first-click — source pins (in-place removal, batched catch-up, 22px hitbox)", () => {
  assert.match(clientSrc, /var rowEl = x\.closest\("\.dna-arow"\);/);
  assert.match(clientSrc, /rowEl\.remove\(\);/);
  assert.match(clientSrc, /function scheduleRender\(\)/);
  assert.match(clientSrc, /clearTimeout\(renderTimer\)/); /* dispose */
  assert.match(clientSrc, /width:22px; height:22px/);
});

test("TC-013 (2026-11-09): openSession workspace-activate fallback — source pins", () => {
  assert.match(clientSrc, /data-dna-ws="' \+ esc\(r\.ws \|\| ""\)/); /* scanner slug rides every row */
  assert.match(clientSrc, /data-dna-ws="' \+ esc\(s\.ws \|\| ""\)/); /* state + live rows too */
  assert.match(clientSrc, /function normWs\(v\)/); /* slug\/title normalizer */
  assert.match(clientSrc, /want\.slice\(-hn\.length\) === hn/); /* suffix match: slug ends with host workspace title */
  assert.match(clientSrc, /overflow:' \+ cssEsc\(ovfKey\)/); /* 2026-11-10: expand "Show N more sessions" once */
  assert.match(clientSrc, /the old deep-link fallback \(dsh\.sessions\.current \+ reload\) is a/);
  assert.ok(!clientSrc.includes('localStorage.setItem("dsh.sessions.current"')); /* dead write removed — host never consumes it */
  assert.ok(!/SESSION_ID_RE/.test(clientSrc)); /* id-gate retired with the deep-link path */
  assert.match(clientSrc, /openSession\(row\.getAttribute\("data-dna-id"\), row\.getAttribute\("data-dna-ws"\)\)/);
});

test("TC-010/011: focus features — eye + nav fold source pins", () => {
  assert.match(clientSrc, /var DNA_BUILD = "states34-openwalk"/);
  assert.match(clientSrc, /\[class\*=\"_rail\"\] \[data-dna-block\]/); /* rail cleanup: block+eye+chev hidden by host rail classes */
  assert.match(clientSrc, /data-since="' \+ esc\(s\.at\)/); /* security P3-1: the tick attribute goes through esc() like every other interpolation */
  assert.match(clientSrc, /var LS_SESSIONS_HIDDEN = "dsh-needs-attention\.sessionsHidden"/);
  assert.match(clientSrc, /var moreHidden = false/); /* per-page flag: reload restores the More row */
  assert.match(clientSrc, /data-dna-eye/); /* eye injected into host headerActions */
  assert.match(clientSrc, /data-dna-foldchev/); /* chevron span inside host More row */
  assert.match(clientSrc, /the fold feature exists only when a Duty row/); /* universal gate: no Duty -> no chevron, native More untouched */
  assert.match(clientSrc, /eyeHide: "Hide session list", eyeShow: "Show session list"/);
  assert.match(clientSrc, /eyeHide: "隐藏会话列表", eyeShow: "显示会话列表"/);
  /* F1 label cue tolerated by anchor match: base = text minus " · N" suffix */
  assert.match(clientSrc, /text\.replace\(\/\\s\*·\\s\*\\d\+\\s\*\$\/, ""\)/);
  /* host-exact icon tokens (live-measured: 16px box, stroke-width 1) */
  assert.match(clientSrc, /EYE_OPEN16 = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"/);
  /* review round: bilingual More detection + write-guards + no-nav-loss restore pass */
  assert.match(clientSrc, /var MORE_TOKENS = \["More", "更多"\]/);
  assert.match(clientSrc, /max-width:60px/); /* actions row cap must be lifted inline — clipping regression */
  assert.match(clientSrc, /React re-renders wipe our injected controls/); /* observer re-apply — React wipes foreign nodes */
  assert.match(clientSrc, /__dnaIco/); /* identical writes guarded — MutationObserver loop */
  assert.match(clientSrc, /never leave the nav hidden without its restore control/);
  /* fold chevron ≤150ms transition, killed under reduced motion */
  assert.match(clientSrc, /\.dna-foldchev svg \{ transition: transform \.15s ease; \}/);
  assert.match(clientSrc, /reduced-motion: reduce[^@]*dna-foldchev svg \{ transition: none; \} \}/); /* crosses inner {} blocks */
});
