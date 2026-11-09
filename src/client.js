/*
 * @almazom/dsh-needs-attention-sidebar — client half (lazy ModuleLoader factory,
 * boot-graph contract per dsh-client-inject-plugin / dsh-message-fullscreen).
 *
 * Zero-core-edit seams:
 *   - anchor: the sidebar's FIRST section header ([class*="_sectionLabel"] lifted to
 *     its [class*="_sectionHeader"]). Its text is "Workspaces" / "工作区" in the
 *     grouped view and "Sessions" / "会话" in the flat view — both are matched, with
 *     a structural fallback for future renames. With no section header at all the
 *     block does NOT attach anywhere else — a wrong slot is worse than a missing
 *     block (product review P3).
 *   - block inserted BEFORE that header = FIRST section under nav.
 *   - rows clone the production row anatomy (h30 r12 pad 0 8px; ttl 14/20;
 *     time 10/16) per SPIKE.md measurements; theme via --dna-* vars.
 * Data: GET /api/dsh-needs-attention/sessions (same-origin cookie auth), poll 10s/30s.
 * Design SSOT: ~/projects/proto-stand/session-states-v3/index.html (variant A + Enclosed,
 * operator-confirmed 2026-11-05). v0.2.0 adds the Finished tab (states) per plan
 * plans/2026-11-05_needs-attention-states.md.
 *
 * Review round 3 (product + reliability + security):
 *   - amber TEXT uses --dna-warn-text (light #8a5300 = 4.9:1 on white, the old
 *     #dd8629 was 2.79:1 and failed AA); --dna-warn stays a FILL color.
 *   - dismissal key is `id@at` (error timestamp), pruned to the current error set,
 *     so a session that errors again later is visible again.
 *   - the group scrolls (max-height 196px ≈ 6 rows) and collapses the tail into a
 *     "+N more" row — it can never push Workspaces off-screen.
 *   - error text is exposed to assistive tech (aria-label + title), not only a tooltip.
 *   - head/rows are keyboard reachable (tabindex + Enter/Space), dismiss is visible
 *     on focus instead of display:none.
 *   - the deep-link fallback validates the session id before writing it to the
 *     core-owned dsh.sessions.current key (same-origin poisoning, security P2).
 */
if (typeof window !== "undefined" && window.__ModuleLoader__) window.__ModuleLoader__.load({
  id: "@almazom/dsh-needs-attention-sidebar",
  factory: function () {
    "use strict";
    if (window.__DSH_NA__) return { name: "@almazom/dsh-needs-attention-sidebar", apply: function () {} };
    window.__DSH_NA__ = true;

    /** Mount-aware route (measured): the panel may serve under a path prefix
     *  (mount path) and the page carries
     *  `<base href="./">`, so a hardcoded "/api/..." leaves the mount, hits the
     *  edge root and comes back with an EMPTY body — "Unexpected end of JSON
     *  input", zero rows, block auto-hidden. Resolve against document.baseURI the
     *  same way the boot HTML writes "plugins/??...". */
    var ROUTE_REL = "api/dsh-needs-attention/sessions";
    function routeUrl() {
      try { return new URL(ROUTE_REL, document.baseURI).href; } catch (e) { return "/" + ROUTE_REL; }
    }
    var LS_DISMISSED = "dsh-needs-attention.dismissed";
    var LS_COLLAPSED = "dsh-needs-attention.collapsed";
    var LS_EXPANDED = "dsh-needs-attention.expanded";
    var LS_LASTVISIT = "dsh.na.lastVisit";
    var LS_TAB = "dsh.needs-attention.tab";
    var LS_SEEN = "dsh.na.seen"; /* TC-003 unseen-completion: {sessionId: tsOfLastOpen} */
    var VISIBLE_ROWS = 6;
    var SESSION_ID_RE = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    var ERR_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
    var WARN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.699 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .699 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
    var X_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4.6 4.6l6.8 6.8"/><path d="M11.4 4.6l-6.8 6.8"/></svg>';
    var OK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
    var MUTE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M10 9v6"/><path d="M14 9v6"/></svg>';
    var WORK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    var SHIELD_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';
    var UNDO_ICON = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 7.2h6.1a3.4 3.4 0 1 1 0 6.8H7.4"/><path d="M6.7 4.5 4.1 7.2l2.6 2.6"/></svg>';
    var CHEV_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6.4 8 9.4l3-3"/></svg>';
    var LVL = {
      fatal: { cls: "dna-lv-red", icon: ERR_ICON, word: "lvlFatal" },
      limit: { cls: "dna-lv-amber", icon: WARN_ICON, word: "lvlLimit" },
    };
    var STATE_LVL = {
      working: { cls: "dna-lv-work", icon: WORK_ICON, word: "stWorking" },
      waiting: { cls: "dna-lv-wait", icon: SHIELD_ICON, word: "stWaiting" },
      look: { cls: "dna-lv-amber", icon: WARN_ICON, word: "stLook" },
      stopped: { cls: "dna-lv-mute", icon: MUTE_ICON, word: "stStopped" },
      ok: { cls: "dna-lv-ok", icon: OK_ICON, word: "stOk" },
    };

    /* TC-016 i18n: locale detected from the anchor label text (CJK -> zh). T = active table. */
    var I18N = {
      en: {
        focus: "Focus",
        headTitle: function (w, n, f) { return "Focus — " + w + " working, " + Math.max(0, n) + " need attention" + (f ? ", " + f + " finished" : ""); },
        tabWork: "Working", tabLook: "Attention", tabDone: "Finished",
        newSuffix: function (n) { return " · " + n + " new"; },
        unseenDiv: "since your last visit",
        more: function (n) { return "+" + n + " more"; },
        less: "show less",
        grpFailed: "Failed", grpLook: "Look", grpWait: "Waiting",
        dismissed: "dismissed — ", undo: "Undo",
        openFailId: "cannot open this session id", openFail: "cannot open this session",
        opening: "opening ", tail: "…",
        lvlFatal: "Error · session stopped", lvlLimit: "Rate limit · 429, still alive",
        stWorking: "Working", stWaiting: "Waiting for approval", stLook: "Look · needs your attention", stStopped: "Stopped by you", stOk: "Done",
        win: function (h) { return " · last " + h + "h"; }, unread: function (n) { return " · " + n + " unreadable log(s)"; },
      },
      zh: {
        focus: "焦点",
        headTitle: function (w, n, f) { return "焦点 — 运行中 " + w + " · 需关注 " + Math.max(0, n) + (f ? " · 已完成 " + f : ""); },
        tabWork: "运行中", tabLook: "关注", tabDone: "已完成",
        newSuffix: function (n) { return " · " + n + " 条新"; },
        unseenDiv: "自上次访问以来",
        more: function (n) { return "还有 " + n + " 条"; },
        less: "收起",
        grpFailed: "失败", grpLook: "需查看", grpWait: "等待",
        dismissed: "已忽略 — ", undo: "撤销",
        openFailId: "无法打开该会话 ID", openFail: "无法打开此会话",
        opening: "正在打开 ", tail: "…",
        lvlFatal: "错误 · 会话已停止", lvlLimit: "触发限流 · 429，仍在运行",
        stWorking: "运行中", stWaiting: "等待批准", stLook: "需要你查看", stStopped: "已被你停止", stOk: "已完成",
        win: function (h) { return " · 最近 " + h + " 小时"; }, unread: function (n) { return " · " + n + " 个日志不可读"; },
      },
    };
    var LOCALE = "en";
    var T = I18N.en;
    function setLocale(l) { if (I18N[l]) { LOCALE = l; T = I18N[l]; } }
    var CSS = [
      "body { --dna-bg:#ffffff; --dna-ink:#1b1b1c; --dna-ink2:#61666b; --dna-hover:rgba(0,0,0,.05); --dna-err:#ec1313; --dna-warn:#dd8629; --dna-warn-text:#8a5300; --dna-badge-bg:#c02a2a; --dna-ok:#2e8f62; --dna-mute:#61666b; }",
      "body[data-ds-dark-theme] { --dna-bg:#1b1b1c; --dna-ink:#f9fafb; --dna-ink2:#adb2b8; --dna-hover:rgba(255,255,255,.08); --dna-err:#f25a5a; --dna-warn:#f59e0b; --dna-warn-text:#f59e0b; --dna-badge-bg:#c02a2a; --dna-ok:#57b183; --dna-mute:#adb2b8; }",
      ".dna-block { margin: 2px 0 6px; }",
      ".dna-head { display:flex; align-items:center; height:36px; padding:0 16px; gap:8px; cursor:pointer; border-radius:8px; }",
      ".dna-head:hover { background: var(--dna-hover); }",
      ".dna-head:focus-visible { outline:2px solid var(--dna-err); outline-offset:-2px; }",
      ".dna-label { font-size:14px; font-weight:400; color: var(--dna-ink2); }",
      ".dna-hspace { flex:1; }",
      ".dna-chev { color: var(--dna-ink2); display:flex; transition: transform .15s; }",
      ".dna-head.dna-collapsed .dna-chev { transform: rotate(-90deg); }",
      ".dna-head.dna-collapsed + .dna-group { display:none; }",
      ".dna-badge { min-width:16px; height:16px; border-radius:8px; background: var(--dna-badge-bg); color:#fff; font: 700 10px/16px -apple-system, system-ui, sans-serif; text-align:center; padding:0 4px; }",
      ".dna-badge.dna-amb { background: var(--dna-warn); color:#1b1b1c; }",
      ".dna-badge.dna-mix { background: linear-gradient(90deg, var(--dna-badge-bg) 50%, var(--dna-warn) 50%); }",
      ".dna-badge.dna-b-work { background:#4da3ff; color:#1b1b1c; }",
  ".dna-badge.dna-b-stop { background: var(--dna-ok); color:#fff; }",
  ".dna-badge.dna-alert { animation: dna-alert 1.6s ease-in-out infinite; }",
      ".dna-group { max-height:480px; overflow-y:auto; overscroll-behavior:contain; }",
      ".dna-arow { display:flex; align-items:center; height:30px; margin:0 16px; padding:0 8px; border-radius:12px; font-size:14px; cursor:pointer; color: var(--dna-ink); }",
      ".dna-arow:hover { background: var(--dna-hover); }",
      ".dna-arow:focus-visible { outline:2px solid var(--dna-err); outline-offset:-2px; }",
      ".dna-slot { width:16px; height:20px; margin-right:4px; display:flex; align-items:center; flex:none; }",
      ".dna-arow.dna-lv-red .dna-slot, .dna-arow.dna-lv-red .dna-t { color: var(--dna-err); }",
      ".dna-arow.dna-lv-amber .dna-slot, .dna-arow.dna-lv-amber .dna-t { color: var(--dna-warn-text); }",
      ".dna-ttl { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:20px; }",
      ".dna-t { font-size:10px; line-height:16px; flex:none; margin-left:6px; }",
      ".dna-x { flex:none; border:0; background:transparent; color: var(--dna-ink2); cursor:pointer; width:22px; height:22px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; padding:0; margin:0 -2px 0 0; opacity:.35; }",
      ".dna-arow:hover .dna-x, .dna-x:focus-visible { opacity:1; }",
      ".dna-x:hover { color: var(--dna-err); }",
      ".dna-x svg { pointer-events: none; }",
      ".dna-more { display:flex; align-items:center; height:26px; margin:0 16px; padding:0 8px 0 28px; border-radius:12px; font-size:12px; color: var(--dna-ink2); cursor:pointer; }",
      ".dna-more:hover { background: var(--dna-hover); }",
      ".dna-toast { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:2147483000; background: var(--dna-ink); color: var(--dna-bg); border-radius:8px; padding:9px 12px; font-size:12px; display:none; align-items:center; gap:10px; box-shadow:0 10px 30px rgba(0,0,0,.35); }",
      ".dna-tab-fin { flex:1.4; }",
      ".dna-tab .dna-tab-t { overflow:hidden; text-overflow:ellipsis; }",
      ".dna-undo { border:0; background:transparent; color:inherit; font: 700 12px/1 -apple-system, system-ui, sans-serif; cursor:pointer; display:inline-flex; gap:5px; align-items:center; text-decoration:underline; }",
      "[data-dna-stale] { opacity:.55; }",
      ".dna-block[data-dna-stale] .dna-label::after { content:' · stale'; color: var(--dna-warn-text); }",
      ".dna-deg { width:6px; height:6px; border-radius:50%; background: var(--dna-warn); display:inline-block; margin-left:6px; flex:none; }",
      ".dna-tabs { display:flex; gap:2px; padding:2px 8px 0; }",
      ".dna-tab { flex:1; display:flex; align-items:center; justify-content:center; height:26px; border:0; border-radius:8px; background:transparent; color: var(--dna-ink2); font: 400 12px/1 -apple-system, system-ui, sans-serif; cursor:pointer; white-space:nowrap; min-width:0; }",
      ".dna-tab[aria-selected=\"true\"] { background: var(--dna-hover); color: var(--dna-ink); font-weight:600; }",
      ".dna-tab:focus-visible { outline:2px solid var(--dna-err); outline-offset:-2px; }",
      ".dna-sub { display:flex; align-items:center; justify-content:space-between; height:24px; margin:2px 16px 0; padding:0 8px; font: 600 10px/16px -apple-system, system-ui, sans-serif; letter-spacing:.04em; text-transform:uppercase; color: var(--dna-ink2); }",
      ".dna-sub-c { font-variant-numeric: tabular-nums; opacity:.7; padding-left:8px; }",
      ".dna-sub.dna-sub-red { color: var(--dna-err); }",
      ".dna-sub.dna-sub-red .dna-sub-c { opacity:1; font-weight:700; }",
      ".dna-div { display:flex; align-items:center; gap:6px; margin:4px 16px 0; padding:0 8px; font-size:10px; line-height:16px; color: var(--dna-ink2); }",
      ".dna-div::before, .dna-div::after { content:'—'; opacity:.4; }",
      ".dna-arow.dna-lv-ok .dna-slot, .dna-arow.dna-lv-ok .dna-t { color: var(--dna-ok); }",
      ".dna-arow.dna-lv-mute .dna-slot, .dna-arow.dna-lv-mute .dna-t { color: var(--dna-mute); }",
      /* TC-002 liveness groups: Working = sky spin (arc loader), Waiting = amber Shield */
      ".dna-arow.dna-lv-work .dna-slot, .dna-arow.dna-lv-work .dna-tick { color: #4da3ff; }",
      ".dna-arow.dna-lv-work .dna-slot svg { animation: dna-spin 1.2s linear infinite; transform-origin: 50% 50%; }",
      ".dna-arow.dna-lv-wait .dna-slot, .dna-arow.dna-lv-wait .dna-t { color: var(--dna-warn-text); }",
      ".dna-tick { font-variant-numeric: tabular-nums; }",
      "@keyframes dna-spin { to { transform: rotate(360deg); } }",
  "@keyframes dna-alert { 0%,100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 6px 1px var(--dna-err); } }",
  "@media (prefers-reduced-motion: reduce) { .dna-badge.dna-alert { animation: none; } .dna-arow.dna-lv-work .dna-slot svg { animation: none; } }",
      ".dna-new { display:inline-block; min-width:12px; margin:0 2px 0 -4px; padding:0 3px; border-radius:7px;"
        + " background: var(--dna-ok); color: var(--dsh-color-bg-base,#1b1b1c); font-size:10px; line-height:14px; text-align:center; font-weight:600; }",
      /* TC-016 zh typography: CJK strokes die at 10px caps — no uppercase, no tracking */
      ".dna-block[data-dna-zh] .dna-sub { text-transform:none; letter-spacing:0; font-size:12px; }",
      ".dna-block[data-dna-zh] .dna-tab { font-size:13px; }",
      ".dna-block[data-dna-zh] .dna-div { font-size:12px; }",
      /* TC-004 rail degrade: <1200px the host sidebar is a 35px rail — badge-only head */
      "@media (max-width: 1199.98px) { .dna-block .dna-label, .dna-block .dna-hspace, .dna-block .dna-chev { display:none; } .dna-block .dna-head { justify-content:center; gap:6px; } }",
    ].join("\n");
    var style = document.createElement("style");
    style.setAttribute("data-plugin-css", "dsh-needs-attention");
    style.textContent = CSS;
    document.head.appendChild(style);
    /* self-heal: if the style tag ever disappears (host head rebuild / HMR), the next
       render restores it — hardening after the 2026-11-06 restart flash report */
    function ensureCss() {
      if (!document.querySelector('style[data-plugin-css="dsh-needs-attention"]')) {
        var s2 = document.createElement("style");
        s2.setAttribute("data-plugin-css", "dsh-needs-attention");
        s2.textContent = CSS;
        document.head.appendChild(s2);
      }
    }

    var rows = [];
    var stateRows = [];
    var meta = { total: 0, degraded: 0, windowH: 12 };
    var lastFetchAt = 0;
    var lastDismissed = null;
    var toastTimer = null;
    var dismissed = loadSet(LS_DISMISSED);
    var expanded = false;
    try { expanded = localStorage.getItem(LS_EXPANDED) === "1"; } catch (e) {}
    /* Divider baseline (plan F7): boot reads the PREVIOUS visit, then writes this one —
       "since your last visit" marks rows newer than the last boot and survives reloads. */
    var visits = (function () {
      try {
        var raw = localStorage.getItem(LS_LASTVISIT);
        var n = raw === null ? null : parseInt(raw, 10);
        localStorage.setItem(LS_LASTVISIT, String(Date.now()));
        return n === null || isNaN(n) ? null : n;
      } catch (e) { return null; }
    })();
    var sTab = "look";
    try { var savedTab = localStorage.getItem(LS_TAB); if (savedTab === "look" || savedTab === "work" || savedTab === "done") sTab = savedTab; } catch (e) {}

    /* TC-003 unseen-completion (T3 Sidebar.logic.ts:698 hasUnseenCompletion): a done row
       is unseen while no open of THAT session happened after its completion time. */
    var seenMap = (function () {
      try { return JSON.parse(localStorage.getItem(LS_SEEN) || "{}") || {}; } catch (e) { return {}; }
    })();
    function markSeen(id) {
      if (!id) return;
      seenMap[id] = Date.now();
      try { localStorage.setItem(LS_SEEN, JSON.stringify(seenMap)); } catch (e) {}
    }
    function isUnseen(s) { return !seenMap[s.id] || seenMap[s.id] < s.at; }
    function pruneSeen() {
      var live = {};
      stateRows.forEach(function (s) { live[s.id] = 1; });
      var changed = false;
      Object.keys(seenMap).forEach(function (k) { if (!live[k]) { delete seenMap[k]; changed = true; } });
      if (changed) { try { localStorage.setItem(LS_SEEN, JSON.stringify(seenMap)); } catch (e) {} }
    }

    function loadSet(key) {
      try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch (e) { return new Set(); }
    }
    function saveSet(key, set) {
      try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (e) {}
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function cssEsc(s) {
      return (window.CSS && window.CSS.escape) ? window.CSS.escape(String(s)) : String(s).replace(/["\\\]]/g, "\\$&");
    }
    /** Dismissal is keyed by the error instance, not the session: a session that
     *  errors again at a newer timestamp becomes visible again (product P1). */
    function dismissKey(r) { return String(r.id) + "@" + String(r.at || 0); }
    function isDismissed(r) { return dismissed.has(dismissKey(r)); }
    function fmtRel(ms) {
      if (!ms) return "";
      var d = lastFetchAt - ms;
      if (d < 60e3) return "now";
      if (d < 3600e3) return Math.max(1, Math.round(d / 60e3)) + "min";
      if (d < 172800e3) return Math.round(d / 3600e3) + "h";
      return Math.round(d / 86400e3) + "d";
    }
    function fmtAbs(ms) { return ms ? new Date(ms).toLocaleString() : "—"; }
    function id8(id) { return String(id).replace(/^session-/, "").slice(0, 8); }
    function rowTip(r) {
      var lv = LVL[r.severity] || LVL.fatal;
      return T[lv.word] + "\n" + (r.lastError || "") + "\nerror at " + fmtAbs(r.at) + " · checked " + fmtAbs(lastFetchAt) + " · session " + id8(r.id);
    }

    function rowHtml(r, hidden) {
      var lv = LVL[r.severity] || LVL.fatal;
      var tip = rowTip(r);
      return '<div class="dna-arow ' + lv.cls + '" data-dna-id="' + esc(r.id) + '" data-dna-key="' + esc(dismissKey(r)) + '"'
        + ' role="button" tabindex="0" aria-label="' + esc((r.title || id8(r.id)) + " — " + (r.lastError || T[lv.word])) + '"'
        + ' title="' + esc(tip) + '"' + (hidden ? ' style="display:none"' : "") + '>'
        + '<span class="dna-slot">' + lv.icon + '</span>'
        + '<span class="dna-ttl">' + esc(r.title || r.id) + '</span>'
        + '<span class="dna-t">' + esc(fmtRel(r.at)) + '</span>'
        + '<button class="dna-x" type="button" data-dna-x="' + esc(dismissKey(r)) + '" aria-label="Dismiss ' + esc(r.title || id8(r.id)) + '">' + X_ICON + '</button></div>';
    }

    /** The block hangs on the sidebar's first section header. That header is not
     *  always called "Workspaces": WorkspaceBrowser.tsx renders
     *  `groupBy === 'flat' ? t('section.sessions') : t('section.workspaces')`, so a
     *  sidebar switched to the flat view says "Sessions" / "会话" and a text-only
     *  anchor produced no block at all (2026-10-31 operator report, reproduced:
     *  groupBy=flat → label "Sessions" → 0 blocks while the plugin is in the boot
     *  graph). Labels first; the structural fallback (first section header that
     *  owns a section label) survives the next rename. Product P3 still holds:
     *  with no section header anywhere the block attaches nowhere. */
    var SECTION_LABELS = ["Workspaces", "工作区", "Sessions", "会话"];
    /** Anchors, in order: a labelled section header → any section header that owns
     *  a section label → the first section header anywhere → the sidebar container
     *  itself. The last two exist because a sidebar can be re-drawn by another
     *  plugin with different class names; a block in the sidebar beats no block,
     *  and the status object below makes a miss visible instead of silent. */
    function findAnchor() {
      var labels = document.querySelectorAll('[class*="_sectionLabel"]');
      var labelled = null, structural = null;
      for (var i = 0; i < labels.length; i++) {
        var text = (labels[i].textContent || "").trim();
        var header = labels[i].closest('[class*="_sectionHeader"]') || labels[i].parentElement;
        if (!header) continue;
        if (SECTION_LABELS.indexOf(text) !== -1) { setLocale(/[一-鿿]/.test(text) ? "zh" : "en"); return { el: header, how: "label:" + text }; }
        if (!labelled && text) labelled = { el: header, how: "sectionLabel:" + text };
      }
      if (labelled) return labelled;
      var anyHeader = document.querySelector('[class*="_sectionHeader"]');
      if (anyHeader && anyHeader.parentElement) return { el: anyHeader, how: "sectionHeader" };
      var side = document.querySelector('[class*="_sidebar"], [class*="_sidebarBody"], aside');
      if (side) return { el: side.firstElementChild || null, how: "sidebar", host: side };
      return null;
    }

    function parseHTML(html) {
      var t = document.createElement("template");
      t.innerHTML = html;
      return t.content.firstElementChild;
    }

    /** Diagnostic surface: a miss must be readable from the browser, not guessed
     *  from a screenshot. `window.__DNA_STATUS__` is the one place to look. */
    var DNA_BUILD = "states21-bright";
    function setStatus(patch) {
      try {
        var prev = window.__DNA_STATUS__ || {};
        window.__DNA_STATUS__ = Object.assign({ build: DNA_BUILD, at: new Date().toISOString() }, prev, patch);
      } catch (e) {}
    }

    var lastSig = "";
    /** State rows (v0.2.0 Finished view, plan TC-004). Tabs per prototype v3:
     *  Attention = scanner errors + look states; Finished = done + stopped-by-you. */
    function stateLvl(s) { return STATE_LVL[s.state] || STATE_LVL.ok; }
    function stateTip(s) {
      var lv = stateLvl(s);
      return T[lv.word] + "\n" + s.kind + (s.cause ? ":" + s.cause : "") + "\nat " + fmtAbs(s.at) + " · checked " + fmtAbs(lastFetchAt) + " · session " + id8(s.id);
    }
    function stateRowHtml(s, hidden) {
      var lv = stateLvl(s);
      var dot = s.state === "ok" && isUnseen(s) ? '<span class="dna-new">!</span>' : '';
      return '<div class="dna-arow ' + lv.cls + '" data-dna-id="' + esc(s.id) + '" data-dna-key="' + esc(dismissKey(s)) + '"'
        + ' role="button" tabindex="0" aria-label="' + esc((s.title || id8(s.id)) + " — " + T[lv.word]) + '"'
        + ' title="' + esc(stateTip(s)) + '"' + (hidden ? ' style="display:none"' : "") + '>'
        + '<span class="dna-slot">' + lv.icon + '</span>'
        + '<span class="dna-ttl">' + esc(s.title || s.id) + '</span>' + dot
        + '<span class="dna-t">' + esc(fmtRel(s.at)) + '</span>'
        + '<button class="dna-x" type="button" data-dna-x="' + esc(dismissKey(s)) + '" aria-label="Dismiss ' + esc(s.title || id8(s.id)) + '">' + X_ICON + '</button></div>';
    }
    /* TC-002 live rows: working (ticking duration) / waiting — informational, never
       clickable, no dismiss × (a live session leaves its group on its own). */
    function fmtDur(ms) {
      var s = Math.max(0, Math.floor(ms / 1000));
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      return h > 0 ? h + "h " + (m < 10 ? "0" : "") + m + "m" : m + ":" + (sec < 10 ? "0" : "") + sec;
    }
    function liveRowHtml(s, hidden) {
      var lv = stateLvl(s);
      var right = s.state === "working"
        ? '<span class="dna-t dna-tick" data-dna-tick data-since="' + s.at + '">' + esc(fmtDur(Date.now() - s.at)) + '</span>'
        : '<span class="dna-t">' + esc(fmtRel(s.at)) + '</span>';
      /* operator report 2026-11-06: live rows MUST open the session like every sidebar
         row (Nielsen H2). Still no dismiss × — an alive session leaves its group alone. */
      return '<div class="dna-arow ' + lv.cls + '" data-dna-live="' + esc(s.id) + '" data-dna-id="' + esc(s.id) + '"'
        + ' role="button" tabindex="0"'
        + ' aria-label="' + esc((s.title || id8(s.id)) + " — " + T[lv.word] + " — open session") + '"'
        + ' title="' + esc(T[lv.word] + "\nat " + fmtAbs(s.at)) + '"' + (hidden ? ' style="display:none"' : "") + '>'
        + '<span class="dna-slot">' + lv.icon + '</span>'
        + '<span class="dna-ttl">' + esc(s.title || s.id) + '</span>'
        + right + '</div>';
    }
    /* ONE interval per block (operator law): ticks only [data-dna-tick] spans,
       paused while the tab is hidden, cleared in dispose. */
    var tickTimer = null;
    function startTicker() {
      if (tickTimer) return;
      tickTimer = setInterval(function () {
        if (document.hidden) return;
        var ticks = document.querySelectorAll("[data-dna-tick]");
        if (!ticks.length) { /* review P3-2: no Working rows left — stop the interval */
          clearInterval(tickTimer);
          tickTimer = null;
          return;
        }
        for (var i = 0; i < ticks.length; i++) {
          ticks[i].textContent = fmtDur(Date.now() - Number(ticks[i].getAttribute("data-since")));
        }
      }, 1000);
    }
    /* operator request 2026-11-06: group headers carry their row count so the size of a
       group stays readable when the tail of the list is cut by the sidebar viewport.
       Failed (>0) paints red — the operator must notice the counter at a glance. */
    function subHtml(text, n, danger) {
      return '<div class="dna-sub' + (danger ? ' dna-sub-red' : '') + '"><span class="dna-sub-t">' + esc(text) + '</span>'
        + (n ? '<span class="dna-sub-c">' + n + '</span>' : '') + '</div>';
    }
    function switchTab(t) {
      if (t !== "look" && t !== "work" && t !== "done") return; /* TC-016: "work" accepted — TC-014 added the tab but missed this whitelist (operator: cannot click Working) */
      sTab = t;
      try { localStorage.setItem(LS_TAB, sTab); } catch (e) {}
      render(true);
    }
    function render(force) {
      ensureCss();
      var anchor = findAnchor();
      if (!anchor || !anchor.el) {
        setStatus({ anchor: null, block: !!document.querySelector("[data-dna-block]"), rows: rows.length, states: stateRows.length, err: "no-anchor" });
        return; /* never a wrong slot */
      }
      var host = anchor.host || (anchor.el && anchor.el.parentElement);
      var ref = anchor.el;
      if (!host) { setStatus({ anchor: anchor.how, block: false, rows: rows.length, err: "no-host" }); return; }
      var aliveErr = rows.filter(function (r) { return !isDismissed(r); });
      pruneSeen(); /* TC-003: drop seen-map ids no longer in scanner output */
      var byState = { ok: [], look: [], stopped: [], working: [], waiting: [] };
      stateRows.forEach(function (s) { if (!isDismissed(s) && byState[s.state]) byState[s.state].push(s); });
      /* attention tab: working + waiting + errors + look (live groups first, TC-002);
         finished tab: stopped by you + done (newest first) */
      var att = byState.working.concat(byState.waiting, aliveErr, byState.look).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var fin = byState.stopped.concat(byState.ok).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var warnLen = aliveErr.length + byState.look.length + byState.waiting.length; /* TC-014: Attention tab = warnings only */
      var block = document.querySelector("[data-dna-block]");
      if (!att.length && !fin.length) { if (block) { block.remove(); lastSig = ""; } setStatus({ anchor: anchor.how, block: false, rows: 0, err: null }); return; } /* ephemeral: disappear when empty (REQ-003) */
      var unseenCount = byState.ok.filter(isUnseen).length; /* TC-003 "M new" tab counter */
      /* operator 2026-11-06: Working sessions are NOT "needing attention" — the badge
         counts only failed/waiting/look; running rows stay visible in the tab, uncounted. */
      var needCount = att.length - byState.working.length;
      var workCount = byState.working.length; /* Focus badge, operator 2026-11-06: blue working + red attention, each zero-hidden */
      /* TC-014 H1 flips live AFTER workCount is assigned — they read it (hoisted-undefined bug caught by probe 2026-11-07) */
      if (!warnLen && workCount > 0 && sTab === "look") { sTab = "work"; try { localStorage.setItem(LS_TAB, sTab); } catch (e) {} } /* H1: attention empty → Working tab */
      if (!warnLen && !workCount && fin.length && sTab === "look") { sTab = "done"; try { localStorage.setItem(LS_TAB, sTab); } catch (e) {} } /* H1 */
      if (!workCount && sTab === "work") { sTab = warnLen ? "look" : "done"; try { localStorage.setItem(LS_TAB, sTab); } catch (e) {} } /* H1 */
      if (!fin.length && sTab === "done") { sTab = (warnLen || !workCount) ? "look" : "work"; try { localStorage.setItem(LS_TAB, sTab); } catch (e) {} } /* H1 */
      var stopCount = byState.stopped.length; /* green pill — Stopped-by-you sessions, operator 2026-11-06 */
      var sig = JSON.stringify([att, fin, Array.from(dismissed), meta, expanded, sTab, visits, byState.ok.map(function (s) { return [s.id, s.at, isUnseen(s)]; })]);
      if (!force && sig === lastSig && block) { setStatus({ anchor: anchor.how, block: true, rows: att.length + fin.length, err: null }); return; } /* P3: no DOM churn on unchanged polls */
      lastSig = sig;
      var red = 0, amb = byState.look.length;
      aliveErr.forEach(function (r) { if (r.severity === "limit") amb++; else red++; });
      var badgeCls = "dna-badge" + (red && amb ? " dna-mix" : amb && !red ? " dna-amb" : "");
      var collapsed = false;
      try { collapsed = localStorage.getItem(LS_COLLAPSED) === "1"; } catch (e) {}
      var headTitle = T.headTitle(workCount, needCount, fin.length) + T.win(meta.windowH) + (meta.degraded ? T.unread(meta.degraded) : "");
      /* flat item list for the ACTIVE tab: {sub} = group caption, {row,isState} = a row */
      var items = [];
      if (sTab === "look") {
        if (aliveErr.length) {
          items.push({ sub: aliveErr.length === 1 && byState.look.length === 0 ? null : T.grpFailed, n: aliveErr.length, danger: aliveErr.length > 0 });
          aliveErr.forEach(function (r) { items.push({ row: r, isState: false }); });
        }
        if (byState.look.length) {
          items.push({ sub: T.grpLook, n: byState.look.length });
          byState.look.forEach(function (s) { items.push({ row: s, isState: true }); });
        }
        if (byState.waiting.length) {
          items.push({ sub: T.grpWait, n: byState.waiting.length });
          byState.waiting.forEach(function (s) { items.push({ row: s, isState: true, live: true }); });
        }
      } else if (sTab === "work") { /* TC-014: Working has its own tab — extracted from Attention (operator 2026-11-07, Nielsen H2) */
        byState.working.forEach(function (s) { items.push({ row: s, isState: true, live: true }); });
      } else {
        var unseenTop = visits != null && fin.length && fin[0].at > visits;
        if (byState.ok.length) {
          items.push({ sub: T.stOk, n: byState.ok.length });
          byState.ok.forEach(function (s) { items.push({ row: s, isState: true }); });
        }
        if (byState.stopped.length) {
          items.push({ sub: T.stStopped, n: byState.stopped.length });
          byState.stopped.forEach(function (s) { items.push({ row: s, isState: true }); });
        }
        items.unseenTop = unseenTop;
      }
      var shown = 0;
      var html = '<div class="dna-block" data-dna-block data-dna-build="' + DNA_BUILD + '"' + (LOCALE === "zh" ? ' data-dna-zh="1"' : "") + '>'
        + '<div class="dna-head' + (collapsed ? " dna-collapsed" : "") + '" role="button" tabindex="0" aria-expanded="' + String(!collapsed) + '" title="' + esc(headTitle) + '">'
        + '<span class="dna-label">' + T.focus + '</span>'
        + (meta.degraded ? '<span class="dna-deg" title="' + esc(meta.degraded + " unreadable log(s)") + '"></span>' : '')
        + '<span class="dna-hspace"></span>'
        + (workCount > 0 ? '<span class="dna-badge dna-b-work">' + workCount + '</span>' : '')
        + (stopCount > 0 ? '<span class="dna-badge dna-b-stop">' + stopCount + '</span>' : '')
        + (needCount > 0 ? '<span class="' + badgeCls + ' dna-alert">' + needCount + '</span>' : '')
        + '<span class="dna-chev">' + CHEV_ICON + '</span></div>'
        + '<div class="dna-group">'
        + '<div class="dna-tabs" role="tablist" aria-label="Focus views">'
        + (workCount > 0 ? '<button type="button" class="dna-tab" role="tab" data-dna-tab="work" aria-selected="' + String(sTab === "work") + '"><span class="dna-tab-t">' + T.tabWork + ' ' + workCount + '</span></button>' : '')
        + (warnLen > 0 ? '<button type="button" class="dna-tab" role="tab" data-dna-tab="look" aria-selected="' + String(sTab === "look") + '"><span class="dna-tab-t">' + T.tabLook + ' ' + warnLen + '</span></button>' : '')
        + '<button type="button" class="dna-tab dna-tab-fin" role="tab" data-dna-tab="done" aria-selected="' + String(sTab === "done") + '"><span class="dna-tab-t">' + T.tabDone + ' ' + fin.length + (unseenCount ? T.newSuffix(unseenCount) : "") + '</span></button>'
        + '</div>';
      if (items.unseenTop) html += '<div class="dna-div">' + T.unseenDiv + '</div>';
      for (var i = 0; i < items.length; i++) {
        if (items[i].sub !== undefined && items[i].sub !== null) { html += subHtml(items[i].sub, items[i].n, items[i].danger); continue; }
        if (!items[i].row && !items[i].isState) continue; /* caption-less group marker ({sub:null}: single Failed, pure Working) carries no row — latent v0.2 crash fixed 2026-11-07 */
        var hide = !expanded && shown >= VISIBLE_ROWS;
        html += items[i].live ? liveRowHtml(items[i].row, hide)
          : items[i].isState ? stateRowHtml(items[i].row, hide) : rowHtml(items[i].row, hide);
        shown++;
      }
      var hiddenCount = expanded ? 0 : Math.max(0, shown - VISIBLE_ROWS);
      if (hiddenCount) html += '<div class="dna-more" data-dna-more role="button" tabindex="0">' + T.more(hiddenCount) + "</div>";
      else if (expanded && shown > VISIBLE_ROWS) html += '<div class="dna-more" data-dna-more role="button" tabindex="0">' + T.less + '</div>';
      html += "</div></div>";
      if (block) {
        block.replaceWith(parseHTML(html));
      } else if (ref && ref.parentElement === host) {
        host.insertBefore(parseHTML(html), ref);
      } else {
        host.insertBefore(parseHTML(html), host.firstChild);
      }
      if (byState.working.length) startTicker(); /* one interval, no-op when no Working rows */
      setStatus({ anchor: anchor.how, block: !!document.querySelector("[data-dna-block]"), rows: att.length + fin.length, err: null });
    }

    function toggleHead(head) {
      var c = head.classList.toggle("dna-collapsed");
      head.setAttribute("aria-expanded", String(!c));
      try { localStorage.setItem(LS_COLLAPSED, c ? "1" : "0"); } catch (e) {}
    }

    function openSession(sid) {
      var native = document.querySelector('[data-row-key="session:' + cssEsc(sid) + '"]');
      if (native) { native.click(); return; } /* same open-session dispatch as native rows (REQ-002) */
      /* P1-B: the target row is often NOT rendered (workspace groups collapse at 5 rows),
         so fall back to the canonical deep-link path — but only for a well-formed id,
         because dsh.sessions.current is core-owned state (security P2). */
      if (!SESSION_ID_RE.test(String(sid))) { toast(T.openFailId, false); return; }
      try { localStorage.setItem("dsh.sessions.current", JSON.stringify({ sessionId: sid })); }
      catch (e) { toast(T.openFail, false); return; }
      toast(T.opening + id8(sid) + T.tail, false);
      setTimeout(function () { try { location.reload(); } catch (e) {} }, 150);
    }

    /* TC-004: batch rebuilds after in-place removals — one render per burst, 250ms later */
    var renderTimer = null;
    function scheduleRender() {
      if (renderTimer) return;
      renderTimer = setTimeout(function () { renderTimer = null; render(); }, 250);
    }

    document.addEventListener("click", function (ev) {
      var x = ev.target.closest("[data-dna-x]");
      if (x) {
        ev.preventDefault();
        ev.stopPropagation();
        var key = x.getAttribute("data-dna-x");
        dismissed.add(key);
        lastDismissed = key;
        saveSet(LS_DISMISSED, dismissed);
        /* TC-004 (operator: «нажимаю нажимаю, и они тяжело удаляются»): remove the row
           in place instead of rebuilding the block — a rebuild under the pointer eats
           the next click (mousedown→mouseup across a replaced node) and resets :hover,
           so the × went invisible mid-click. Rapid dismissals now always land. */
        var rowEl = x.closest(".dna-arow");
        var ttlEl = rowEl && rowEl.querySelector(".dna-ttl");
        var ttl = ttlEl ? (ttlEl.textContent || "").trim() : "";
        if (rowEl) rowEl.remove();
        scheduleRender(); /* counts/totals catch up in one batch, not per click */
        toast(T.dismissed + (ttl ? ttl.slice(0, 40) : id8(String(key).split("@")[0])), true);
        return;
      }
      var tabBtn = ev.target.closest("[data-dna-tab]");
      if (tabBtn) { switchTab(tabBtn.getAttribute("data-dna-tab")); return; }
      var head = ev.target.closest(".dna-head");
      if (head) { toggleHead(head); return; }
      var more = ev.target.closest("[data-dna-more]");
      if (more) {
        expanded = !expanded;
        try { localStorage.setItem(LS_EXPANDED, expanded ? "1" : "0"); } catch (e) {}
        render(true);
        return;
      }
      var row = ev.target.closest("[data-dna-id]");
      if (row) { markSeen(row.getAttribute("data-dna-id")); openSession(row.getAttribute("data-dna-id")); }
    });

    /* keyboard parity: the head and rows are tabbable (product P2) */
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var tabBtn = t.closest("[data-dna-tab]");
      if (tabBtn) { ev.preventDefault(); switchTab(tabBtn.getAttribute("data-dna-tab")); return; }
      if (t.closest(".dna-head")) { ev.preventDefault(); toggleHead(t.closest(".dna-head")); return; }
      var more = t.closest("[data-dna-more]");
      if (more) { ev.preventDefault(); expanded = !expanded; try { localStorage.setItem(LS_EXPANDED, expanded ? "1" : "0"); } catch (e) {} render(true); return; }
      var row = t.closest("[data-dna-id]");
      if (row) { ev.preventDefault(); markSeen(row.getAttribute("data-dna-id")); openSession(row.getAttribute("data-dna-id")); } /* F13: keyboard counts as seen too */
    });

    function toast(msg, undoable) {
      var t = document.querySelector("[data-dna-toast]");
      if (!t) {
        t = document.createElement("div");
        t.className = "dna-toast";
        t.setAttribute("data-dna-toast", "");
        t.setAttribute("aria-live", "polite");
        t.innerHTML = '<span class="dna-toastmsg"></span><button class="dna-undo" type="button">' + UNDO_ICON + T.undo + "</button>";
        document.body.appendChild(t);
        t.querySelector(".dna-undo").addEventListener("click", function () {
          if (lastDismissed) {
            dismissed.delete(lastDismissed);
            lastDismissed = null;
            saveSet(LS_DISMISSED, dismissed);
            render();
          }
          t.style.display = "none";
        });
      }
      t.querySelector(".dna-toastmsg").textContent = msg;
      t.querySelector(".dna-undo").style.display = undoable ? "inline-flex" : "none"; /* no Undo on a non-undoable toast */
      if (!undoable) lastDismissed = null;
      t.style.display = "flex";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.style.display = "none"; }, 7000);
    }

    var failStreak = 0;
    var warnedStale = false;
    function poll() {
      if (document.hidden) return; /* P3: no polling while the tab is hidden */
      fetch(routeUrl(), { credentials: "same-origin", headers: { accept: "application/json" } })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("http " + res.status)); })
        .then(function (data) {
          if (!data) return;
          failStreak = 0;
          warnedStale = false;
          rows = Array.isArray(data.sessions) ? data.sessions : [];
          /* strip-states guard (F3): an OLD server (rollback path) sends no states —
             the client degrades to errors-only instead of rendering a broken block. */
          var st = data && data.states && !Array.isArray(data.states) ? data.states : null;
          stateRows = [];
          if (st) ["working", "waiting", "ok", "look", "stopped"].forEach(function (g) {
            var list = Array.isArray(st[g]) ? st[g] : [];
            for (var i = 0; i < list.length; i++) stateRows.push(Object.assign({ state: g }, list[i]));
          });
          meta = {
            total: typeof data.total === "number" ? data.total : rows.length,
            degraded: typeof data.degraded === "number" ? data.degraded : 0,
            windowH: data.windowH || 12,
          };
          lastFetchAt = data.at || Date.now();
          pruneDismissed(rows.concat(stateRows));
          var blk = document.querySelector("[data-dna-block]");
          if (blk) blk.removeAttribute("data-dna-stale"); /* P2-6: recovery clears the stale marker */
          render();
        })
        .catch(function (err) {
          /* P2-6: never freeze silently — after 3 failures mark the block stale + warn once */
          failStreak++;
          if (failStreak >= 3 && !warnedStale) {
            warnedStale = true;
            try { console.warn("[needs-attention] refresh failing:", String((err && err.message) || err)); } catch (e) {}
            var b = document.querySelector("[data-dna-block]");
            if (b) b.setAttribute("data-dna-stale", "1");
          }
        })
        .then(schedule, schedule);
    }

    /** Keep only dismissal keys that correspond to the CURRENT error set, so the
     *  store cannot grow without bound and an old dismissal cannot hide a new error. */
    function pruneDismissed(current) {
      var live = {};
      current.forEach(function (r) { live[dismissKey(r)] = 1; });
      var changed = false;
      Array.from(dismissed).forEach(function (k) { if (!live[k]) { dismissed.delete(k); changed = true; } });
      if (changed) saveSet(LS_DISMISSED, dismissed);
    }

    setStatus({ booted: true, anchor: null, block: false, rows: 0, err: null });
    poll();
    /** Cadence (operator expectation 2026-10-31): a session that recovers must
     *  LEAVE the list promptly. The route answers in ~1-2 ms warm, so a block
     *  that is showing rows polls every 10 s and an empty block every 30 s;
     *  returning to the tab or focusing the window polls immediately. */
    var POLL_ACTIVE_MS = 10000;
    var POLL_EMPTY_MS = 30000;
    var pollTimer = null;
    function schedule() {
      if (pollTimer) clearTimeout(pollTimer);
      var every = document.querySelector("[data-dna-block]") ? POLL_ACTIVE_MS : POLL_EMPTY_MS;
      pollTimer = setTimeout(function () { poll(); }, every);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    window.addEventListener("focus", function () { poll(); });

    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if ((rows.length || stateRows.length) && !document.querySelector("[data-dna-block]")) render(true);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return {
      name: "@almazom/dsh-needs-attention-sidebar",
      apply: function () {},
      dispose: function () {
        try { observer.disconnect(); } catch (e) {}
        try { clearTimeout(pollTimer); pollTimer = null; } catch (e) {}
        try { clearInterval(tickTimer); tickTimer = null; } catch (e) {} /* TC-002 ticker */
        try { clearTimeout(renderTimer); renderTimer = null; } catch (e) {} /* TC-004 batch */
        try { clearTimeout(toastTimer); toastTimer = null; } catch (e) {} /* review P3-1 */
      },
    };
  },
});
