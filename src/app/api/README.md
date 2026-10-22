# api/

HTTP endpoints:

- `/api/export` — file downloads
- `/api/review/[resource]` — authenticated GET reads outside the server-action queue:
  realtime changes, batched entity states, document activity, notifications,
  catalogue search, metadata, versions, paragraphs, review status/changes, issuing bodies, and user role.
  Responses are private and `no-store`. Supplied budget cycles must match the
  selected cookie; existing handlers retain authorization and cycle-scoped RLS.
  These routes reuse server handlers; they introduce no mutation endpoints.

Browser callers use `src/features/mandates/services/client-reads.ts`. Use abort
signals for replaceable reads such as search, and keep writes as server actions.
