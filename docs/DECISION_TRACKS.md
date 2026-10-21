# Entity submissions and review decisions

Each citation row has two independent append-only event histories. Existing events
are entity submissions, regardless of their author, approval, or review session.
There is no historical role reconstruction. Both columns appear for all cycles;
PPB 2027 submissions remain read-only and PPB 2028 submissions remain active.

Users can edit their own entity's submissions, including when they are reviewers.
Reviewer permissions separately allow review decisions within their review scope;
they never grant access to another entity's primary submissions. An active review
session locks submissions even for reviewers belonging to that entity. Outside a
session, additions by someone editing their own entity go to the submission;
reviewers working on a locked or another entity's submission add to the review.
Review decisions can be made outside sessions. Before a review decision is set,
“Copy submission decision” atomically copies the exact latest submission's decision, reasons, replacement and metadata.
Every review records that submission event's ID (or null if none exists). Changes
to a submission, including its reason or clearing it, make earlier reviews stale.
The old review remains visible. Reviewers can confirm/change their previous review. Editing a stale review's reason alone does
not confirm the new submission. Clearing review appends a cancel event; it never
deletes entity submissions or history. The old approval fields remain stored but
are no longer editable or used as the review workflow.

Start review locks entity decisions, additions, reasons and manual metadata for that
entity and selected cycle. Comments and exports remain available. Ending review
unlocks submissions and preserves both histories. Session transitions and decision
writes share a transaction advisory lock to prevent a concurrent write crossing
the submission-lock boundary. Session IDs group review events and do not determine
their track. Ending a session does not assert that all rows have been reviewed.

## Exports

- Entity submission applies only entity decisions.
- Reviewed outcome applies current review decisions, with entity submissions as
  fallback for absent, cleared or stale reviews. Neither decision leaves original
  citations unchanged. Reviewer-only additions appear only in reviewed outcomes.
- Reviewed downloads show a notice when entity submissions are used as fallback.
  Filenames distinguish the modes. Analysis summaries use the same reviewed
  outcome selection rule.

## Rollout

Apply `sql/migrations/010_separate_review_decisions.sql` manually **before deploying
this application version**, after migration 009. The application has no migration
runner. This SQL has been prepared but not applied by the coding agent.

The migration adds `decision_track` (default entity), `reviewed_submission_id`, a
same-cycle foreign key, a track/latest index, and a unique active-session index.
Existing decisions, approvals, comments, sessions and responses are retained.
Existing RLS remains in force; the source reference cannot cross budget cycles.
The migration deliberately fails if an entity/cycle already has duplicate active
sessions; reconcile such sessions explicitly rather than guessing which to end.

Read-only preflight for the duplicate-session prerequisite:

```sql
SELECT budget_version, entity, count(*)
FROM mandates_housekeeping.entity_review_mode
WHERE ended_at IS NULL
GROUP BY budget_version, entity HAVING count(*) > 1;
```

Deploy code and schema together; reverting code alone after review events exist
would make the old single-track implementation misinterpret those events.
