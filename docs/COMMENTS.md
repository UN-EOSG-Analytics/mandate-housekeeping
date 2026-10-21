# Shared resolution conversations

Comments form one shared conversation for a canonical document symbol within a submission cycle. The originating entity/subprogramme provides context and grouping, rather than a separate thread. Other entities can read the conversation. Ordinary users post only under their own entity; reviewers authorized to review any entity can also post there. Review-session locks do not block comments. Archived-cycle comments remain read-only.

## Interface

The document sidebar's **Comments & decisions** tab replaces the separate Decisions and Activity tabs. It combines the two decision controls with expandable entity/subprogramme groups. The originating context starts expanded; the composer keeps that fixed context even when another group is expanded. Comments are chronological and prominent. Consecutive decision events between comments collapse to the most recent event in each decision track; the earlier events remain available under Show history. Historical resolution fields are retained but have no resolve/reopen controls in this interface.

Posting waits for the returned persisted comment. Pending and failed saves preserve the text; retry is explicit. Successful saves update the conversation immediately. No optimistic empty-ID comments are inserted.

The resolution table shows the total number of comments across the shared conversation and a personal unread indicator. The header dropdown lists recent messages concerning the user's own entity or a resolution conversation in which they have commented. Authors never receive notifications for their own messages. Participation is scoped to the resolution and submission cycle, not a particular entity/subprogramme.

Notification navigation selects the message's submission cycle, opens its entity page, and opens a standalone resolution sidebar even if the citation is absent from the table or hidden by a filter. It expands the addressed group and scrolls to the exact message. Opening the dropdown itself does not mark messages read.

## Read tracking and polling

Personal read receipts store exact comment IDs, not a timestamp watermark. Messages become read when they are visible in an expanded sidebar group while the browser document is visible. Hidden tabs, closed groups, and messages below the viewport are not marked read. Visible IDs are batched briefly before saving. Receipts are immutable and separate from historical comments, so they can be written for archived cycles without enabling archived review writes.

The existing sidebar poll fetches decisions, comments, and personal read IDs in one authenticated cycle-scoped transaction. A shared client notification store performs a single visibility-aware refresh about every 30 seconds, refreshes when opened, and refreshes after local saves/read receipts. Header and table subscribers share that store. No email notifications, scheduled jobs, subscriptions, assignments, or separate inbox page are introduced.

## Deployment

Apply migrations **010**, **011_comment_reads.sql**, then **012_comment_read_grants.sql**, with the migration owner before deploying this application. These migrations are not applied automatically. Migration 011 adds the `comment_reads` table, a same-cycle foreign key to comments, the conversation index, and forced RLS that requires both selected cycle and authenticated transaction-local user email.

Migration 012 explicitly grants the runtime role SELECT and INSERT on `mandates_housekeeping.comment_reads`; apply it as the table owner or an administrator to repair existing installations. Existing default grants in `sql/schema/app_role.sql` cover it when the same migration owner creates the table; installations with a different owner must grant these privileges explicitly. UPDATE and DELETE are not needed by the application and have no RLS policies.

All existing comments initially appear unread because there are no historic per-user receipts. No comments, decisions, or historical resolved flags are rewritten. Notification dropdown results are bounded to the most recent 100 messages; total unread and resolution counts include all matching comments.

## Offline checks

- `node scripts/verify-comment-notifications.mjs`: exact-ID archived read receipts, stale-cycle rejection, auth, and safe navigation without marking read.
- `node scripts/verify-comment-conversation.mjs`: grouping, independent-track history collapsing, and real composer callbacks preserving failed/pending drafts.
- Existing decision and export workflow checks remain applicable.

No browser-level behavior or live database migration is exercised by these checks.
