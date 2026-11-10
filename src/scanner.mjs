/**
 * scanner.mjs — on-request session-log scanner for dsh-needs-attention.
 * Pure derivation + I/O separated; no top-level side effects (test-safe).
 *
 * Semantics (PLAN v3, REQ-004/005):
 *   - a session is listed iff its LATEST terminal event (turn/end) is an error:
 *       kind "error" | "aborted" → row {severity: fatal|limit}
 *       any other kind (success/complete/…) → cleared, not listed (LATEST-TERMINAL-EVENT RULE)
 *   - severity: limit (amber) when the message carries a 429/rate-limit/quota
 *     signature, else fatal (red). Auth failures are fatal (plan decision table).
 *   - cost bounds: freshness window + mtime cache per file + streaming to EOF with a
 *     fixed-size ring of terminal events (never a head truncation: review P1-A) +
 *     20 s response throttle + single-flight + bounded concurrency (G4 warm <=200ms).
 *   - failures are never silent: unreadable logs surface as `degraded` (review P2-3).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/** Default log root: $DSH_HOME/sessions — the lane that runs the plugin owns the logs
 * (each lane exports its own DSH_HOME). Review P2-1: a hardcoded lane-specific
 * path served another lane's titles outside its lane. */
function defaultRoot() {
  return join(process.env.DSH_HOME || join(homedir(), ".dsh"), "sessions");
}

export function logRoot() {
  return process.env.DSH_NEEDS_ATTN_LOG_ROOT || defaultRoot();
}

/** 429/rate-limit/quota signature → amber. Auth/413/5xx/abort → red (fatal). */
const LIMIT_RE =
  /\b429\b|rate[-_ ]?limit|rate_limit_error|usage limit|quota|billing|reached your|5[- ]?hour/i;

/** Strip credential shapes from error text before it ever leaves the process.
 * The route is same-origin and cookie-gated, but a log line can carry a pasted
 * key; measured 0 credential shapes in 269 live turn/end messages (review), yet
 * redaction is cheap insurance (security P2). */
export function redact(text) {
  let out = String(text ?? "");
  out = out.replace(/sk-[A-Za-z0-9_\-]{6,}/g, "sk-[redacted]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]{8,}/gi, "Bearer [redacted]");
  out = out.replace(
    /(api[_-]?key|access[_-]?token|token|secret|password)(\s*[:=]\s*)\S+/gi,
    (_m, name, sep) => `${name}${sep}[redacted]`,
  );
  return out;
}

/** Classify one error message → "fatal" | "limit" (REQ-004). */
export function classifyError(message) {
  return LIMIT_RE.test(String(message ?? "")) ? "limit" : "fatal";
}

/** Reduce a raw event stream to terminal events (bounded ring) + last title (pure).
 * TC-001 liveness retention: lastTurn (turn/start), lastApproval (approval/asked),
 * lastEnd (turn/end) — {seq,time} triplets carried on the result for working/waiting. */
export function reduceEvents() {
  const events = [];
  let title = null;
  let lastTurn = null;
  let lastApproval = null;
  let lastDecision = null; /* review P1: approval/decided unpins a Waiting session */
  let lastEnd = null;
  return {
    push(e) {
      const t = e?.type;
      if (t === "turn/start") {
        lastTurn = { seq: e.seq ?? 0, time: e.time ?? 0 };
      } else if (t === "approval/asked") {
        lastApproval = { seq: e.seq ?? 0, time: e.time ?? 0 };
      } else if (t === "approval/decided") {
        lastDecision = { seq: e.seq ?? 0, time: e.time ?? 0 };
      } else if (t === "turn/end") {
        const r = e.data?.reason ?? {};
        const kind = r.kind ?? "unknown";
        const message = r.error?.message ?? r.message ?? `turn ${kind}`;
        events.push({ time: e.time ?? 0, kind, message: redact(message).slice(0, 300), cause: r.reason?.kind ?? null });
        if (events.length > 50) events.splice(0, events.length - 50);
        lastEnd = { seq: e.seq ?? 0, time: e.time ?? 0 };
      } else if (t === "session/title") {
        title = e.data?.title ?? title;
      }
    },
    result() {
      return { events, title, lastTurn, lastApproval, lastDecision, lastEnd };
    },
  };
}

/* Finished view (TC-002): taxonomy v2, Nielsen-corrected (operator-confirmed m00613).
   Ordered table, first match wins (T3 Sidebar.logic.ts:861 precedence style):
   ok=completed; look=blocked,max-tokens,aborted:hook; stopped=aborted:user,parent;
   hidden (no row): aborted:disposed,aborted:legacy,forked; error/interrupted stay errors. */
const STATE_TABLE = [
  { kinds: ["completed"], state: "ok" },
  { kinds: ["blocked", "max-tokens"], state: "look" },
  { match: (k, c) => k === "aborted" && c === "hook", state: "look" },
  { match: (k, c) => k === "aborted" && (c === "user" || c === "parent"), state: "stopped" },
];
const STATES_ROW_CAP = 20;

/** Derive the finished-state group for one terminal event (pure). */
export function deriveState(ev) {
  if (!ev) return null;
  const k = ev.kind;
  const c = ev.cause ?? null;
  if (k === "error" || k === "interrupted") return null; // belongs to errors[]
  for (const row of STATE_TABLE) {
    if (row.kinds ? row.kinds.includes(k) : row.match(k, c)) return row.state;
  }
  return null; // aborted:disposed/legacy, forked, unknown future kinds → never surfaced (H8)
}

/** Derive the row for one session from its parsed terminal events (pure). */
export function deriveRow(id, events, title) {
  let last = null;
  for (const ev of events) {
    if (!last || (ev.time ?? 0) >= (last.time ?? 0)) last = ev;
  }
  if (!last) return null;
  if (last.kind !== "error" && last.kind !== "interrupted") return null; // REQ-005 cleared; aborted moved to states (TC-002)
  return {
    id,
    title: redact(title || id.replace(/^session-/, "").slice(0, 12)),
    severity: classifyError(last.message),
    lastError: String(last.message ?? last.kind),
    at: last.time ?? 0,
  };
}

/** Derive the finished-state row for one session from its terminal events (pure). */
export function stateRowFor(id, events, title) {
  let last = null;
  for (const ev of events) {
    if (!last || (ev.time ?? 0) >= (last.time ?? 0)) last = ev;
  }
  const state = deriveState(last);
  if (!state) return null;
  return {
    id,
    state,
    title: redact(title || id.replace(/^session-/, "").slice(0, 12)),
    kind: last.kind,
    cause: last.cause ?? null,
    at: last.time ?? 0,
  };
}

const PER_FILE_TIMEOUT_MS = 8000;

/**
 * Stream one zstd session log to EOF, retaining only the last 50 terminal events.
 * Resolves {ok:true, events, title} on success, {ok:false, reason} on failure
 * (spawn error / timeout) so callers can report `degraded` instead of guessing.
 */
function readTailEvents(path) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    let timer = null;
    const red = reduceEvents();
    let good = 0;
    let bad = 0;
    let lines = 0;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { child && child.kill(); } catch {}
      resolve(ok ? { ok: true, ...red.result() } : { ok: false, reason: reason || "error" });
    };
    try {
      child = spawn("zstdcat", [path], { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve({ ok: false, reason: "spawn" });
      return;
    }
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    timer = setTimeout(() => finish(false, "timeout"), PER_FILE_TIMEOUT_MS);
    rl.on("line", (line) => {
      let e;
      try { e = JSON.parse(line); good++; } catch { bad++; return; }
      red.push(e);
      /* Yield the event loop every 2000 lines: a 229 MB / 87k-line log otherwise
         blocks the lane's HTTP server for ~1 s on the first poll (review P1). */
      if (++lines % 2000 === 0) { try { rl.pause(); } catch {} setImmediate(() => { try { rl.resume(); } catch {} }); }
    });
    /* completion = child exit status, not just EOF: a garbage .zstd exits non-zero
       while still producing (empty) output — that MUST count as degraded (review 2). */
    child.on("close", (code) => {
      if (code !== 0) return finish(false, "zstd-exit");
      /* valid zstd but every line unparsable = a corrupt log, not a healthy one */
      if (good === 0 && bad > 0) return finish(false, "unparsable");
      finish(true);
    });
    child.on("error", () => finish(false, "spawn"));
  });
}

const fileCache = new Map(); // path -> { mtimeMs, row }
let responseCache = { at: 0, result: null };
let inFlight = null;
const THROTTLE_MS = 20_000;
/* A NaN/0/negative window used to mean "scan the whole store" (493 MB) and then
   drop every row, i.e. a full cold scan that renders an empty block (review P1). */
const RAW_WINDOW_H = Number(process.env.DSH_NEEDS_ATTN_WINDOW_H ?? 12);
export const WINDOW_H = Number.isFinite(RAW_WINDOW_H) && RAW_WINDOW_H > 0 && RAW_WINDOW_H <= 720 ? RAW_WINDOW_H : 12;
const BIG_FILE_BYTES = 8 * 1024 * 1024;
const BIG_FILE_REUSE_MS = 60_000;
const FUTURE_SKEW_MS = 60_000;
const CONCURRENCY = 6;
const ROW_CAP = 20;

function pickLogFile(dirPath, entries) {
  let best = null;
  for (const f of entries) {
    const m = /^session\.(?:v(\d+)\.)?jsonl\.zstd$/.exec(f);
    if (!m) continue;
    const v = Number(m[1] ?? 0);
    if (!best || v > best.v) best = { v, name: f };
  }
  return best ? join(dirPath, best.name) : null;
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/**
 * List sessions whose latest terminal event is an error, within the freshness window.
 * @returns {Promise<{sessions: Array, total: number, windowH: number, degraded: number, at: number}>}
 */
export async function scanSessions({ now = Date.now() } = {}) {
  if (responseCache.result && now - responseCache.at < THROTTLE_MS) return responseCache.result;
  if (inFlight) return inFlight; // single-flight: concurrent requests share one scan
  inFlight = doScan(now).finally(() => { inFlight = null; });
  return inFlight;
}

/* Sessions the host has archived never render in the sidebar (workspace.json
   archivedSessionIds), so a Focus row for one could never be opened — clicking it
   always dead-ended ("cannot open this session", operator report 2026-11-10).
   Drop them at candidate time; best-effort: unreadable registry = no filtering. */
function archivedSet() {
  try {
    const reg = JSON.parse(readFileSync(join(dirname(logRoot()), "storages", "workspace.json"), "utf8"));
    return new Set(reg?.global?.archivedSessionIds || []);
  } catch { return new Set(); }
}

async function doScan(now) {
  const root = logRoot();
  const cutoff = now - WINDOW_H * 3_600_000;
  const archived = archivedSet();
  const cands = [];
  let stores = [];
  let rootOk = true;
  try { stores = readdirSync(root); } catch { stores = []; rootOk = false; }
  for (const ws of stores) {
    const wsPath = join(root, ws);
    let dirs = [];
    try { dirs = readdirSync(wsPath); } catch { continue; }
    for (const dir of dirs) {
      if (!dir.startsWith("session-")) continue;
      const dirPath = join(wsPath, dir);
      let entries = [];
      try { entries = readdirSync(dirPath); } catch { continue; }
      const file = pickLogFile(dirPath, entries);
      if (!file) continue;
      let st;
      try { st = statSync(file); } catch { continue; }
      if (st.mtimeMs < cutoff) continue; // freshness window (review P2-4)
      if (archived.has(dir)) continue; // host-archived: no sidebar row exists, row would be dead
      cands.push({ id: dir, path: file, mtimeMs: st.mtimeMs, size: st.size, ws: ws });
    }
  }
  let degraded = 0;
  const entries = await mapLimit(cands, CONCURRENCY, async (c) => {
    const hit = fileCache.get(c.path);
    if (hit && hit.mtimeMs === c.mtimeMs) {
      if (hit.failed) degraded++; // cached failure keeps counting — never silent on a repeat poll
      return hit;
    }
    /* An active session appends constantly: re-decompressing a 66 MB log every poll
       cost 964 ms (review P1). For big logs reuse the previous row for up to a minute. */
    if (hit && c.size >= BIG_FILE_BYTES && now - (hit.readAt ?? 0) < BIG_FILE_REUSE_MS) return hit;
    const tail = await readTailEvents(c.path);
    let row = null;
    let stateRow = null;
    let failed = null;
    if (tail.ok) {
      row = deriveRow(c.id, tail.events, tail.title);
      stateRow = stateRowFor(c.id, tail.events, tail.title);
    } else { failed = tail.reason || "error"; degraded++; } // unreadable log → surface, never pretend "healthy"
    const entry = { mtimeMs: c.mtimeMs, row, stateRow, failed, readAt: Date.now(),
      /* TC-001 liveness (F6): warm polls reuse the cache, so the liveness triplets
         and the title must ride the entry or working[] goes empty on steady state. */
      title: tail.ok ? (tail.title ?? null) : (hit?.title ?? null),
      lastTurn: tail.ok ? (tail.lastTurn ?? null) : (hit?.lastTurn ?? null),
      lastApproval: tail.ok ? (tail.lastApproval ?? null) : (hit?.lastApproval ?? null),
      lastDecision: tail.ok ? (tail.lastDecision ?? null) : (hit?.lastDecision ?? null),
      lastEnd: tail.ok ? (tail.lastEnd ?? null) : (hit?.lastEnd ?? null) };
    fileCache.set(c.path, entry);
    return entry;
  });
  const live = new Set(cands.map((c) => c.path));
  for (const k of fileCache.keys()) if (!live.has(k)) fileCache.delete(k); // bounded cache
  const inWindow = (r) => r && r.at >= cutoff && r.at <= now + FUTURE_SKEW_MS;
  /* TC-001 liveness: open turn / pending approval + fresh mtime → alive session.
     Fresh = log touched within 30 min; a cold orphan (open turn, stale log) keeps its
     terminal row — it is not "running" (S0 census: dead subagent orphans 781+ min old).
     F1 precedence: approval newer than the last turn/end wins over an open turn. */
  const FRESH_MS = 30 * 60 * 1000;
  const working = [];
  const waiting = [];
  entries.forEach((e, i) => {
    const cand = cands[i];
    /* 2026-11-09 open-session fix: rows carry their workspace slug so the client can activate the right workspace group when the host has no rendered row (deep-link key is a no-op in the host). */
    if (e.row) e.row.ws = cand.ws;
    if (e.stateRow) e.stateRow.ws = cand.ws;
    const { lastTurn, lastApproval, lastDecision, lastEnd } = e;
    if (!lastTurn && !lastApproval) return;
    const fresh = now - cand.mtimeMs < FRESH_MS;
    const fallbackTitle = cand.id.replace(/^session-/, "").slice(0, 12);
    /* review P1: an ANSWERED approval (approval/decided after approval/asked) no longer
       counts as pending — approve-then-keep-working must show Working, not Waiting. */
    const approvalNewer = lastApproval
      && (!lastEnd || lastApproval.seq > lastEnd.seq)
      && (!lastDecision || lastApproval.seq > lastDecision.seq);
    if (approvalNewer) {
      if (fresh) waiting.push({ id: cand.id, state: "waiting", title: e.title ? redact(e.title) : fallbackTitle, at: lastApproval.time, ws: cand.ws });
      return;
    }
    const open = lastTurn && (!lastEnd || lastTurn.seq > lastEnd.seq);
    if (open && fresh) working.push({ id: cand.id, state: "working", title: e.title ? redact(e.title) : fallbackTitle, at: lastTurn.time, ws: cand.ws });
  });
  working.sort((a, b) => b.at - a.at);
  waiting.sort((a, b) => b.at - a.at);
  const alive = new Set([...working, ...waiting].map((r) => r.id));
  /* Revive-exclusion (operator bug 2026-11-06): a session that came alive again must
     leave EVERY finished list — ok/look/stopped AND errors (F9, single surface) —
     and totals are counted AFTER exclusion (F8), never from the pre-filter set. */
  const all = entries
    .map((e) => e.row)
    .filter(inWindow)
    .filter((r) => !alive.has(r.id))
    .sort((a, b) => b.at - a.at);
  /* Finished view: states from the SAME ring — zero extra zstdcat cost (m00121). */
  const states = {
    working: working.slice(0, STATES_ROW_CAP),
    waiting: waiting.slice(0, STATES_ROW_CAP),
    ok: [], look: [], stopped: [],
    totals: { ok: 0, look: 0, stopped: 0 },
  };
  const stateRows = entries
    .map((e) => e.stateRow)
    .filter(inWindow)
    .filter((r) => !alive.has(r.id))
    .sort((a, b) => b.at - a.at);
  for (const r of stateRows) {
    states.totals[r.state] += 1;
    if (states[r.state].length < STATES_ROW_CAP) states[r.state].push(r);
  }
  const result = {
    sessions: all.slice(0, ROW_CAP),
    total: all.length,
    states,
    windowH: WINDOW_H,
    /* an unreadable root must never look like "everything is healthy" (review P2) */
    degraded: rootOk ? degraded : Math.max(1, degraded),
    rootOk,
    at: now,
  };
  responseCache = { at: now, result };
  return result;
}
