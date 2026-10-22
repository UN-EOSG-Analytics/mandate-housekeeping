# DOCX uploads removed

The application no longer offers DOCX uploads or an upload HTTP endpoint.
The unfinished storage-only feature and its application storage dependencies
were removed. Exporting mandate DOCX files remains available.

The unused Python ingestion worker, deployment workflow, dependency-export
script, and worker workspace configuration have also been removed. The scaffold
never implemented DOCX decision ingestion and was not connected to the app.

Local DOCX parsing and analysis tools in `python/` remain available via `uv run`.

Historical `mandates_housekeeping.docx_uploads` records and previously stored
files have not been deleted or modified.
