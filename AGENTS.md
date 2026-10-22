# AGENTS.md

This file provides guidance to Claude Code, Codex, and other AI agents when working with code in this repository.

## Related work

The data from this app eventually feeds the mandate registry (mandates.un.org, github.com/united-nations/mandates), though currently via an indirect path where the data is first published via DOCX documents, and these DOCX documents are then parsed in turn. This is because DGACM is also making minor changes in the workflow when working with the overall budget documents, which happens in DOCX and of which only a small part is covered by this tool, namely andate citations.

It is also related to the UN Digital Lbrary mirror (github.com/united-nations/documents), from where it can fetch up-to-date metadata on documents via the Postgres DB.

## What this app does

Internal UN tool for reviewing **mandates** in the Programme Budget. Entity reviewers log in, inspect the document citations ("mandates") backing each budget part of their entity, and record housekeeping decisions (keep / remove / etc.) plus comments. Decisions feed the next budget cycle. The active review cycle is **ppb2027** (submissions for PPB 2028). The previous **ppb2026** cycle (submissions for PPB 2027) is read-only.

## Commands

Package manager is **pnpm** (Node app) and **uv** (Python). Do not use npm/pip.

```bash
pnpm dev            # Next.js dev server
pnpm build          # production build (also runs as a pre-commit hook on `main`)
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier --write on src/**
uv sync             # install Python deps for local analysis and DOCX extraction
```

There is **no test suite**. Verify changes with `pnpm typecheck` and `pnpm build`. A Husky pre-commit hook runs `pnpm build` only when committing on the `main` branch, so builds must be green before committing to main.

## Architecture

The active application has three pieces:

- **Next.js** (`src/`) — control plane: auth, UI, orchestration, exports. Next.js 16 App Router + React 19.
- **Postgres** (Azure Flexible Server) — single source of truth.
- **Python** — local analysis and DOCX parsing/normalization (`python/`).

### Database access — raw `pg`

All DB access goes through the raw `pg` pool in [src/lib/db/db.ts](src/lib/db/db.ts): use `query()` and `transaction()`. The pool connects via Azure's built-in PgBouncer on port 6432 (transaction pooling mode); max 10 connections per Vercel function instance. Write parameterized SQL — no named prepared statements, which is also required for PgBouncer transaction pooling compatibility.

Two Postgres schemas:
- `mandates_housekeeping.*` — this app's own state: `users`, `magic_tokens`, `allowed_domains`, `allowed_reviewers`, `mandate_decisions`, `mandate_comments`, `entity_review_mode`, `review_change_responses`, `docx_uploads`.
- `ppb2026.*` — shared upstream budget data this app reads: `source_document_citations`, `source_documents`, `source_documents_metadata_clean`, `budget_documents`, `budget_document_versions`.

The upload UI and HTTP endpoint have been removed. Historical `docx_uploads` rows and stored files remain intact; see [docs/DOCX_UPLOAD.md](docs/DOCX_UPLOAD.md).

SQL schema and migrations live in [sql/](sql/) (`sql/schema/`, `sql/migrations/`). They are applied manually/externally — there is no migration runner in the app.

#### Querying the DB from the shell

To run ad-hoc queries, use the **`DATABASE_URL_CLAUDE`** env var (not `DATABASE_URL`):

```bash
set -a; . ./.env; set +a
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"   # psql is from brew libpq, not on default PATH
psql "$DATABASE_URL_CLAUDE" -c "..."
```

### Budget version scoping (critical gotcha)

`ppb2026.source_document_citations` holds citations for **multiple budget cycles**. Every citation query **must** be scoped to the selected version or rows from other cycles leak into the UI (e.g. entities appear twice). Always inline the predicate from [src/lib/db/budget-version.ts](src/lib/db/budget-version.ts) (`versionPredicateSql(alias)`, `CURRENT_BUDGET_VERSION`) into citation `WHERE` clauses. `CURRENT_BUDGET_VERSION` is the default active cycle (`ppb2027`); the selected cycle may differ.

### Code organization — feature-first under `src/features/`

The app is organized by feature, each holding `actions/` (`"use server"` server actions), `services/` (pure data/business logic, called from server components and actions), and `ui/` (client components).

- `src/features/auth/` — magic-link auth, session, mail.
- `src/features/mandates/` — the core domain. Subfolders: `services/` (`data-service.ts`, `reference-data.ts`, `mandate-warnings.ts`, `age-indicator.ts`, `decision-reasons.ts`), `services/documents/` (metadata, versions, newer-version detection), `services/export/` (DOCX/Excel/applied-state export), `actions/` (decisions, comments, review-mode, review-baselines, realtime).

`src/components/` holds shared/page components; `src/components/ui/` is shadcn/ui primitives (never edit these directly — compose around them). `src/app/` is App Router routes. `src/lib/` holds db, theme, constants, utils.

> ⚠️ [docs/STRUCTURE.md](docs/STRUCTURE.md) and [docs/DATA.md](docs/DATA.md) describe an older `src/lib/services/` layout and a `housekeeping-actions.ts` monolith. That refactor is **done** — code now lives under `src/features/mandates/`. Trust the actual tree over those docs.

### Auth

Custom magic-link auth — no third-party auth library.
- Login is restricted to allowed domains/emails (`allowed_domains`, `allowed_reviewers` tables); `isValidUnEmail` enforces `@un.org`.
- A magic token is emailed (SMTP via nodemailer), exchanged for an HMAC-signed session cookie (`auth_session`).
- Route protection is in [src/proxy.ts](src/proxy.ts) — this is Next.js 16's renamed middleware (`proxy`, not `middleware`). It verifies the cookie via Web Crypto and redirects unauthenticated users to `/about`. Public paths: `/login`, `/verify`, `/about`.

### Realtime

No websockets. Collaboration is **polling-based**: [src/hooks/useRealtimeDecisions.ts](src/hooks/useRealtimeDecisions.ts) polls the `realtime` server action (~30s) to sync other reviewers' decisions and review-mode status.

### API routes

Used only where App Router needs a real HTTP endpoint (see [src/app/api/README.md](src/app/api/README.md)): `/api/export/...` (file downloads) only. Everything else uses server actions/server components, not API routes.

### Python

Local analysis and DOCX extraction scripts live in `python/`: `llm_relevance.py` uses Azure OpenAI, `analysis.py` performs local analysis, and `ppb_extraction/` parses PPB DOCX into per-entity data. Run them with `uv run`.

The unused DOCX ingestion worker, deployment workflow, and workspace configuration have been removed. There is no background upload/ingestion service.

## Conventions

- TypeScript strict mode; avoid `any`. Define explicit prop/action/API types (`src/types/`).
- Prefer Server Components; add `"use client"` only for interactive parts.
- Data fetching, calculations, and processing belong in `services/` (and server `actions/`), **not** in components.
- shadcn/ui: add components with `npx shadcn@latest add <component>`; compose around `components/ui/` primitives rather than editing them.
- Styling: Tailwind CSS **v4.1** (use current v4 syntax, not v3). Theme tokens and the UN color palette (esp. `un-blue`) live in [src/lib/theme.ts](src/lib/theme.ts); prefer them.
- Design: left-align, minimal, clear visual hierarchy.
- Secrets via `.env` / `process.env` only (see `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, SMTP, Azure OpenAI).
- Don't create parallel infrastructure or hardcode where a global/shared solution exists.
