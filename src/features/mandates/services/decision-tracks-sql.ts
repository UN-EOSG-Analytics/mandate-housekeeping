/** Cycle isolation is supplied by the transaction's RLS context. */
export function effectiveDecisionsCteSql(): string {
  return `latest_track_events AS (
    SELECT DISTINCT ON (entity, document_symbol, COALESCE(subprogramme, ''), decision_track) *,
      bool_or(decision = 'add') OVER (PARTITION BY entity, document_symbol, COALESCE(subprogramme, '')) AS has_addition
    FROM mandates_housekeeping.mandate_decisions
    ORDER BY entity, document_symbol, COALESCE(subprogramme, ''), decision_track, created_at DESC, id DESC
  ), current_reviews AS (
    SELECT r.* FROM latest_track_events r
    LEFT JOIN latest_track_events e ON e.entity = r.entity
      AND e.document_symbol = r.document_symbol
      AND e.subprogramme IS NOT DISTINCT FROM r.subprogramme AND e.decision_track = 'entity'
    WHERE r.decision_track = 'review' AND r.decision <> 'cancel'
      AND r.reviewed_submission_id IS NOT DISTINCT FROM e.id
  ), latest_decisions AS (
    SELECT * FROM current_reviews
    UNION ALL
    SELECT e.* FROM latest_track_events e
    WHERE e.decision_track = 'entity' AND NOT EXISTS (
      SELECT 1 FROM current_reviews r WHERE r.entity = e.entity
        AND r.document_symbol = e.document_symbol
        AND r.subprogramme IS NOT DISTINCT FROM e.subprogramme
    )
  )`;
}
