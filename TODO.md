# TODO — Pre-Pilot Outstanding Items

All items have been addressed. Remaining entries are post-pilot
nice-to-haves.

---

## Bugs

### ~~B1. Points do not accumulate across phases~~ FIXED
Added `cumulativePoints` ref in `ExperimentRunner` that persists across
phases. `ps.totalPoints` still tracks per-phase points for logging;
`cumulativePoints.current` drives the display and `onExperimentEnd()`.

### ~~B2. No `beforeunload` / `pagehide` handler~~ FIXED
Added `beforeunload` listener in `App.tsx` that:
1. Shows the browser's default "Leave site?" confirmation dialog.
2. Calls `navigator.sendBeacon` to invoke `abandon_assignment` RPC,
   freeing the slot immediately.
3. Triggers a best-effort `logger.flush()`.
Only fires when the experiment has not yet completed.

---

## Missing Client Code

### ~~M1. `abandon_assignment` RPC is defined but never called~~ FIXED
Added `abandonAssignment(sessionId)` export in `assignmentClient.ts`.
Wired into the `beforeunload` handler via `sendBeacon`.

---

## Tests

### ~~T1. No unit tests for `assignmentClient.ts`~~ FIXED
21 tests covering offline fallback, API success/failure paths,
`activateAssignment`, `completeAssignment`, `abandonAssignment`,
and `createSession`.

### ~~T2. No unit/integration tests for `/api/assign-order.ts`~~ FIXED
16 tests covering CORS preflight, method validation, input validation
(6 cases), parameter clamping, successful RPC, RPC error, and RPC
exception paths.

### ~~T3. No test for duplicate bin/event insert on flush retry~~ FIXED
9 tests covering monotonic `event_seq`, buffer-and-flush, retry
re-queue with preserved seq values, upsert conflict keys for all
three tables, offline mode, local log capture, auto-flush at
BATCH_SIZE, and periodic interval flush.

---

## Schema Gaps

### ~~S1. No unique constraint on `bin_log(session_id, phase_index, bin_index)`~~ FIXED
Added unique constraint in `007_add_dedup_constraints.sql`.
DataLogger now uses `upsert` with `ignoreDuplicates: true`.

### ~~S2. Same risk on `event_log`~~ FIXED
Added `event_seq` column (monotonic client-side counter) and
`UNIQUE (session_id, event_seq)` constraint in `007_add_dedup_constraints.sql`.
Also added `phase_summary` unique constraint on `(session_id, phase_index)`.
DataLogger uses upsert for all three tables.

---

## Configuration / Deployment

### ~~C1. `CORS_ALLOWED_ORIGIN` not in `.env.example`~~ FIXED
Added to `.env.example` with comment.

### ~~C2. Vercel `@vercel/node` not in `devDependencies`~~ FIXED
Installed as devDependency.

---

## UX / Robustness

### ~~U1. No focus-loss detection~~ FIXED
Added `visibilitychange` listener in `ExperimentRunner` that pauses
the phase clock when the tab is hidden and resumes on restore. Logs
`focus_lost` and `focus_restored` events with pause duration metadata.
Responses are blocked while the tab is hidden.

### ~~U2. No session-resume after page refresh~~ FIXED
Session ID, assigned order, and participant ID are persisted to
`sessionStorage` after successful assignment. On page load, if a
saved session exists, the app restores state and skips to the
instructions screen. Cleared on experiment completion or consent
decline. A `session_restored` event is logged for traceability.

### ~~U3. Game-loop `useEffect` dependency chain~~ FIXED
Added `cancelAnimationFrame` guard at the top of `startPhase` to prevent
double animation frame scheduling during phase transitions.

---

## Nice-to-Have (Post-Pilot)

- **N1.** Add a Supabase cron (pg_cron) to call `expire_stale_reservations()` every 5 minutes instead of relying on the next assignment call to clean up.
- **N2.** Add a simple admin dashboard page (password-protected) showing live order counts, rather than requiring CLI scripts.
- **N3.** Add data-export scripts (CSV from Supabase) for analysis pipelines.
- **N4.** Add integration test that renders `App` through the full consent → practice → end flow using `@testing-library/react` with fake timers.
