# Submissions for PPB 2028 activation

The active source cycle is `ppb2027`, producing submissions for **PPB 2028**.
The previous source cycle `ppb2026` (submissions for PPB 2027) is read-only.
The default selection is PPB 2028; the new selection cookie resets previous
saved selections once. Users can select PPB 2027 to read historical work.

## Database step

Coordinate the application update with manual application of
`sql/migrations/009_activate_ppb2028_submissions.sql` as the migration owner.
Migration 006 must already be applied. Do not reapply or modify migration 006.

009 changes the column defaults and SELECT/INSERT/UPDATE/DELETE RLS policies on
all five workflow tables. Reads follow the selected cycle. Writes require both
`budget_version = 'ppb2027'` and a matching transaction-local cycle. Existing
rows, decisions, comments, review sessions, uploads and audit fields stay intact.
It runs in one transaction and may be reapplied safely.

Until 009 is applied, the previous database policy rejects PPB 2028 writes,
even though the updated app enables its controls. The app also rejects writes
to PPB 2027, so the transition does not permit edits to archived work.

## Stale pages and jobs

Mutation requests must identify their originating active cycle. Old bundles
that omit the cycle, or requests whose cycle differs from the selected cycle,
receive a reload error before database access. DOCX uploads have the same check.
Queued worker jobs retain their immutable source cycle; archived-cycle jobs are
rejected instead of being reassigned to PPB 2028. Ingestion remains unimplemented.

## Validation

Run `pnpm typecheck`, `pnpm lint`, `pnpm build` and
`pnpm exec tsx scripts/verify-migration.ts`. The latter includes offline checks
that all ten archived-cycle actions and all ten stale-page actions reject
before database access, and that a matching PPB 2028 cycle passes the cycle gate.
Its historical migration reconciliation and grants report describes the stored
baseline, not current live permissions or an execution test of migration 009.
