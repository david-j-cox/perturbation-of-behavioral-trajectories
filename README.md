# Perturbation of Behavioral Trajectories

A production-ready browser experiment for a human concurrent-operants task with counterbalanced perturbation-order assignment, real-time two-key responding, automatic phase control, robust logging, and secure cloud storage.

## Scientific Design

### Task Overview

Participants make choices between two concurrently available response options by clicking on left or right panels. Responses may produce point reinforcers according to independent concurrent VI schedules. The participant sees a running point total and response feedback but no schedule details.

### Schedule Parameters

| Parameter | Value |
|---|---|
| Baseline VI (both sides) | 20 s |
| COD (changeover delay) | 2 s |
| Bin size | 5 s |
| Min A phase duration | 60 s |
| Max A phase duration | 180 s |
| Perturbation phase duration | 45 s |
| Practice duration | 30 s |

### Perturbation Types

- **B (Reinforcement-rate)**: VI 8 s on the less-preferred key, VI 30 s on the more-preferred key
- **C (Forced-displacement/lockout)**: Every 10 s, a 2 s lockout on the preferred key; responses logged but cannot produce reinforcement
- **D (Contextual)**: Background palette change, "Context Shift" label, brief tone at onset; VI schedules unchanged

### Counterbalancing Scheme

6 perturbation orders, 2 participants each = 12 target (budget-dependent):

| Order | Phase Sequence |
|---|---|
| BCD | A1 B1 A2 B2 A3 C1 A4 C2 A5 D1 A6 D2 |
| BDC | A1 B1 A2 B2 A3 D1 A4 D2 A5 C1 A6 C2 |
| CBD | A1 C1 A2 C2 A3 B1 A4 B2 A5 D1 A6 D2 |
| CDB | A1 C1 A2 C2 A3 D1 A4 D2 A5 B1 A6 B2 |
| DBC | A1 D1 A2 D2 A3 B1 A4 B2 A5 C1 A6 C2 |
| DCB | A1 D1 A2 D2 A3 C1 A4 C2 A5 B1 A6 B2 |

### Steady-State Criterion (A phases)

A phases end when **all** of the following are met on **two consecutive** bin checks:
- At least 60 s elapsed
- 12 completed bins available
- |OLS slope| of left allocation over most recent 12 bins ≤ 0.0015
- SD of left allocation over those bins ≤ 0.06
- At least 100 total responses across those bins

Otherwise, A phases timeout at 360 s.

## Assignment Lifecycle

### Status Definitions

| Status | Meaning |
|---|---|
| `created` | Session created, no assignment yet |
| `reserved` | Order assigned, participant hasn't started experiment |
| `active` | Participant has started the experiment |
| `completed` | Experiment finished successfully |
| `abandoned` | Participant left before meaningful task start |
| `expired` | Reservation timed out (default: 30 min) |
| `cancelled` | Manually cancelled by staff |

### How Atomic Assignment Works

1. Client calls `reserve_counterbalanced_order` via Supabase RPC or `/api/assign-order` Vercel endpoint
2. The Postgres function acquires an advisory lock to serialize concurrent requests
3. Stale reservations are expired first
4. Current counts per order are computed (excluding test, expired, released, cancelled sessions)
5. Orders with the minimum count are identified as eligible
6. One is chosen pseudorandomly via `random()`
7. Assignment is inserted atomically within the same transaction
8. The advisory lock is released when the transaction commits

The RPC is `SECURITY DEFINER` — it runs with elevated privileges regardless of the caller's role, so the anon key cannot directly modify `order_assignments`.

### How Stale Reservations Expire

- Reservations have a `reservation_expires_at` timestamp (default: 30 min after creation)
- The `reserve_counterbalanced_order` function automatically expires stale reservations before computing counts
- The `expire_stale_reservations()` function can be called manually or via cron
- Expired reservations are excluded from balancing counts

## Database Schema

### Tables

- **participants**: `id`, `participant_id`, `created_at`
- **sessions**: `id`, `participant_id`, `experiment_id`, `status`, `is_test`, `debug_mode`, `app_version`, `rng_seed`, screen/browser metadata
- **order_assignments**: `session_id`, `assigned_order`, `assignment_status`, `reservation_expires_at`, `candidate_orders_json`, `assignment_metadata_json`
- **event_log**: Per-event granular log with `event_type`, `phase_label`, `key`, `side`, `rt_ms`, `points`, schedule state
- **bin_log**: 5 s bin aggregates per phase
- **phase_summary**: Per-phase summary with response counts, allocations, steady-state metrics

### Event Types

`consent_agreed`, `consent_declined`, `participant_id_submitted`, `assignment_requested`, `assignment_reserved`, `assignment_failed`, `instructions_viewed`, `practice_start`, `practice_end`, `phase_start`, `phase_end`, `response`, `switch`, `reinforcer_baited`, `reinforcer_delivered`, `cod_start`, `cod_end`, `lockout_start`, `lockout_end`, `bin_closed`, `experiment_end`, `upload_error`

## Architecture

### Client-Side Operations
- Session creation (INSERT to `sessions`)
- Event logging (INSERT to `event_log`, `bin_log`, `phase_summary`)
- All experiment runtime logic (schedule engine, phase control, steady-state detection)

### Server-Side Operations
- Order assignment (via Supabase RPC `SECURITY DEFINER` or Vercel `/api/assign-order`)
- Assignment activation and completion (via RPC)
- Reservation expiry (via RPC)

### Security
- RLS enabled on all tables
- Browser uses anon key for safe INSERT-only operations
- `order_assignments` has no anon-accessible policies — all access goes through `SECURITY DEFINER` RPCs
- Service role key is only used server-side (Vercel serverless functions)
- No secrets exposed to the browser

## Setup & Development

### Prerequisites
- Node.js 18+
- A Supabase project (or run in offline debug mode)
- Vercel CLI (for deployment)

### Install Dependencies
```bash
npm install
```

### Configure Supabase

1. Create a Supabase project at https://supabase.com
2. Copy `.env.example` to `.env` and fill in credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
3. Run SQL migrations in order:
   ```bash
   # In the Supabase SQL Editor, run each file in order:
   supabase/migrations/001_create_tables.sql
   supabase/migrations/002_create_indexes.sql
   supabase/migrations/003_create_views.sql
   supabase/migrations/004_create_rpc_reserve_order.sql
   supabase/migrations/005_create_rpc_helpers.sql
   supabase/migrations/006_enable_rls.sql
   supabase/migrations/007_add_dedup_constraints.sql
   ```

### Run Locally
```bash
npm run dev
```

### Run in Offline Debug Mode
Set `VITE_DEBUG_LOCAL_ONLY=true` in `.env`. Data logs to browser memory and can be downloaded as JSONL from the end screen.

### Run Tests
```bash
npm test           # Run all tests once
npm run test:watch # Watch mode
```

### Run 30-User Assignment Load Test
```bash
npm run test:load
```
Without Supabase credentials, this runs an offline simulation. With credentials, it creates 30 concurrent sessions and verifies even distribution.

### Inspect Balancing Counts
```bash
npx tsx scripts/admin_counts.ts
```

### Expire Stale Reservations
```bash
npx tsx scripts/expire_reservations.ts
```

### Seed Test Sessions
```bash
npx tsx scripts/seed_test_sessions.ts 6
```

## Deployment to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Set these environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_EXPERIMENT_ID`
- `VITE_APP_VERSION`

## SQL Migration Order

1. `001_create_tables.sql` — Core tables
2. `002_create_indexes.sql` — Performance indexes
3. `003_create_views.sql` — `active_order_counts` view
4. `004_create_rpc_reserve_order.sql` — Atomic assignment function
5. `005_create_rpc_helpers.sql` — Activate, complete, expire, counts functions
6. `006_enable_rls.sql` — Row Level Security policies
7. `007_add_dedup_constraints.sql` — Unique constraints to prevent duplicate rows on flush retry

## Known Limitations & Pilot Checks

- **Browser focus**: The experiment does not pause if the browser tab loses focus. Consider adding a focus-loss detector for data quality.
- **Mobile**: Designed for desktop use. Mobile browsers are not officially supported but click-based input should function.
- **Refresh recovery**: If a participant refreshes mid-experiment, the session is not resumable. A new session would be created.
- **Clock drift**: `performance.now()` is used for relative timing within sessions. Wall-clock timestamps are logged for cross-session alignment.
- **Audio**: The D perturbation tone requires a prior user gesture (click) to enable Web Audio. The instructions screen satisfies this.

### Pilot Checklist

- [ ] Run the experiment end-to-end in debug mode and download JSONL
- [ ] Verify all 12 phases execute in correct order for each of the 6 orders
- [ ] Verify steady-state detection terminates A phases appropriately
- [ ] Verify B perturbation correctly identifies and remaps preferred key
- [ ] Verify C lockout appears/disappears on the correct side at correct intervals
- [ ] Verify D context shift changes colors and plays tone
- [ ] Verify points accumulate and reset between practice and main experiment
- [ ] Run `npm run test:load` with Supabase credentials and verify 5-per-order distribution
- [ ] Verify completion code is unique and copyable
- [ ] Verify data appears correctly in Supabase tables
- [ ] Check event_log, bin_log, and phase_summary coherence for one complete session
- [ ] Test concurrent access with 2+ browser tabs
- [ ] Verify RLS: attempt direct INSERT to order_assignments from browser console (should fail)
