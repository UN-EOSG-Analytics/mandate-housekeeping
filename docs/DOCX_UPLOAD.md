# DOCX uploads removed

The application no longer offers DOCX uploads or an upload HTTP endpoint.
The unfinished storage-only feature and its application storage dependencies
were removed. Exporting mandate DOCX files remains available.

Historical `mandates_housekeeping.docx_uploads` records and previously stored
files have not been deleted or modified. The legacy Python worker is scaffolding;
it is not connected to the application and does not ingest decisions.

The notes below describe the earlier proposed architecture, not a supported feature.

---

The architecture in one sentence

> Next.js is the control plane (auth, upload, orchestration, UX). Python is the ingestion engine (DOCX parsing + normalization). Postgres is the source of truth. Azure Blob is file storage.


Best-simple choice: Next.js enqueues, Python worker consumes

Upload docx to Blob (ideally via SAS direct upload)

Next.js writes a row in Postgres: status='uploaded'

Next.js sends a message to a queue with document_id (and blob path)

Python worker picks it up, processes, writes result, updates Postgres



> sync API call vs async job

Upload architecture on Vercel (important)

For reliability on Vercel, the best pattern is:

Direct-to-Blob upload

Next.js requests a short-lived upload permission (SAS) from your backend

Browser uploads DOCX directly to Azure Blob

Next.js records metadata + creates ingestion job in Postgres

---

The core decision

DOCX extraction is CPU/memory spiky, sometimes slow, and can be security-sensitive (untrusted files). So the best practice is:

Next.js handles upload + auth + UX

A dedicated ingestion service handles parsing + validation + normalization

Postgres is the single source of truth

Processing is asynchronous (queue/job), with progress + error visibility


Minimal, solid architecture
Flow

Next.js uploads DOCX to Azure Blob (or temporarily receives it and streams to Blob).

Next.js creates:

a documents row (blob URI, sha256, uploader, etc.)

an ingestion_jobs row with status='queued'

A single Python worker wakes up, claims the next queued job from Postgres, parses DOCX, writes extracted data to Postgres, marks job done/failed.

UI polls /api/jobs/:id every 2–5 seconds (or uses SSE later).