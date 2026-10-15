"""DOCX ingestion entry point (parsing/decision ingestion is not implemented).

Jobs must carry the immutable upload budgetVersion; the selected registry default
must never reinterpret a queued job. Database RLS independently disables PPB2027
writes if a future worker connects as the housekeeping application role.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


def cli() -> None:
    logger.info("DOCX ingestion is not implemented")


def main(event: Any) -> dict[str, Any]:
    if not isinstance(event, dict) or event.get("budgetVersion") not in ("ppb2026", "ppb2027"):
        return {"status": "error", "message": "An explicit known budgetVersion is required"}
    if event["budgetVersion"] != "ppb2026":
        return {"status": "error", "message": "Review is disabled for this budget cycle"}
    return {"status": "not_implemented", "message": "DOCX decision ingestion is not implemented"}


if __name__ == "__main__":
    cli()
