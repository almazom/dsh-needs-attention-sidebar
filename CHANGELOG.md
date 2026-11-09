# Changelog

All notable changes to this project are documented in this file.
Format: Keep a Changelog; versioning: SemVer.

## [0.4.0-alpha.1] - 2026-11-09

### In plain words (dev channel — try the new controls, expect rough edges)
- A new **eye icon** in the sidebar section header (next to search / settings) hides the whole session list; the header label keeps a count ("Workspaces · 13") so you always know how much is hidden. Click again to show.
- The **"More" row in the left navigation** got a small chevron: click it to fold the nav stack (Plugins / Automation / Duty disappear, More stays as the restore control).
- Both states survive a page reload and are fully undoable — nothing is lost.
- Chinese hosts get localized tooltips; the detection of the nav row works in both EN and 中文.

### Upgrading
This is a pre-release on the `dev` branch. Install from the branch:
```
dsh plugin --profile web add github:almazom/dsh-needs-attention-sidebar#dev
```
Or wait for the stable v0.4.0 — nothing here is required.

## [0.3.0] - 2026-11-07

### In plain words
- The plugin now speaks Chinese: if your DSH runs in 中文, the Focus block is fully translated.
- The blue "Working" marker spins — alive sessions are visible at a glance.
- The dismiss × is faintly visible without hover (touch screens can dismiss too).
- Tab labels never wrap; on narrow windows (<1200px) the block degrades to a compact badge-only head.
- The toast now names the row you dismissed (was: an id fragment).
- Docs: badge color corrected (unseen "!" is green), upgrade notes added.

### Upgrading
Reinstall from the same GitHub URL (`dsh plugin … add https://github.com/almazom/dsh-needs-attention-sidebar` or paste it in Plugins → Add plugin). Your dismissals/collapse state survives (same local storage keys).

### Known limitations
- The hide-sessions eye and the More-block collapse ship in v0.4.0-alpha (prototyped separately).
- The route path and internal ids are stable; the npm-scope name changed in 0.3.0 (@almazom/dsh-needs-attention → @almazom/dsh-needs-attention-sidebar) — old installs keep working but update the URL.

### Added
- **Tabs**: Working / Attention / Finished — three-tab triage instead of one mixed list (TC-014). Working sessions live in their own tab; the Attention tab holds only warnings (errors + look + waiting); the Finished tab shows ok + stopped rows with a `· N new` unseen counter.
- **Unseen tracking**: `!` badges on finished rows you have not looked at yet, plus a "since your last visit" divider (localStorage `dsh.na.seen` / `dsh.na.lastVisit`).
- **Dismiss**: per-row dismiss (`×`) with an undo toast; dismissed rows stay hidden across reloads (localStorage `dsh-needs-attention.dismissed`).
- **Collapse**: the whole block collapses to the header chips row (chevron toggle, state persisted).
- **Keyboard & aria parity**: rows are reachable and activatable by keyboard; groups/rows carry aria labels.
- **Diagnostics**: `window.__DNA_STATUS__` exposes the live state for debugging.
- **Config**: `DSH_NEEDS_ATTN_WINDOW_H` (freshness window, 1..720, default 12) and `DSH_NEEDS_ATTN_DEADLINE_MS` (scan deadline, default 10000) environment knobs.

### Changed
- Scanner hardening: mtime file cache, 20s response throttle + single-flight, zstdcat streaming with a 50-event ring, per-file 8s timeout, event-loop yields every 2000 lines, 6-way concurrency, big-file (8MB/60s) reuse, row caps (20 rows per scan / per state list).
- Route guard: exact-table `/api` route matching happens BEFORE the prefix gate; the route carries its own admission guard (loopback fallback), responds 405 to non-GET and 504 `scan-timeout` past the deadline, `Cache-Control: no-store`.
- Secret redaction in extracted titles (`sk-…`, `Bearer …`, `token=…` shapes stripped).
- State table: completed→ok, blocked/max-tokens→look, aborted:hook→look, aborted:user/parent→stopped (you stopped it), disposed/legacy/forked hidden; 429/rate-limit/quota/billing/5-hour patterns → amber "limit", all other terminal errors → red "fatal".

### Security
- Security property (verified 2026-10-30): the plugin's `/api/…` route always guards itself — exact-table route matches happen BEFORE the host's prefix gate, so the route can never rely on host middleware that does not cover it. Auth check: unauthenticated requests get 401 from the plugin's own guard.

## [0.2.0] - 2026-10-31

### Added
- First public-shaped release: sidebar section above Workspaces listing sessions whose latest terminal event is an error (red = fatal, amber = 429), server-side on-request log scan via a `ctx.inject` webServer route, client DOM-anchor injection, zero core edits.
- Approved proto variant A geometry; shipped live on a production lane.
