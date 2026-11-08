# Changelog

All notable changes to this project are documented in this file.
Format: Keep a Changelog; versioning: SemVer.

## [0.3.0] - 2026-11-07

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
- Route admits only the authenticated harness connection (or loopback); exact-table guard covers the 2026-10-30 P0 finding that `/api/*` routes bypass prefix-based gates.

## [0.2.0] - 2026-10-31

### Added
- First public-shaped release: sidebar section above Workspaces listing sessions whose latest terminal event is an error (red = fatal, amber = 429), server-side on-request log scan via a `ctx.inject` webServer route, client DOM-anchor injection, zero core edits.
- Approved proto variant A geometry; shipped live on a production lane.
