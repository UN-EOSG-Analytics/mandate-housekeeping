/**
 * Budget version scoping for source_document_citations.
 *
 * The shared ppb2026.source_document_citations table holds citations for
 * multiple budget cycles (ppb2026 = PPB 2026 + PKM 2025/26, ppb2027 = PPB
 * 2027 + PKM 2026/27). This housekeeping app reviews the ppb2026 cycle to
 * produce input for ppb2027, so every citation query must scope to ppb2026
 * — otherwise PPB 2027 rows leak into the UI (e.g. each entity appears
 * twice in the budget-part tree under "Other").
 *
 * Membership: a citation belongs to version V iff its origin_document
 * matches the regex of any budget_documents row that has a
 * budget_document_versions row for version V.
 */

export const CURRENT_BUDGET_VERSION = "ppb2026";

/** The next/comparison cycle whose fascicle is loaded into the same tables. */
export const COMPARISON_BUDGET_VERSION = "ppb2027";

/** All budget versions known to live in ppb2026.source_document_citations. */
export const KNOWN_BUDGET_VERSIONS = ["ppb2026", "ppb2027"] as const;
export type BudgetVersion = (typeof KNOWN_BUDGET_VERSIONS)[number];

/**
 * EXISTS predicate restricting a citation row (`alias.origin_document`) to a
 * specific budget version. Inline this with `AND` in WHERE clauses.
 *
 * `version` MUST come from {@link KNOWN_BUDGET_VERSIONS} — it is interpolated
 * directly into SQL, so it must never be derived from user input. The
 * allowlist check enforces this.
 */
export function versionPredicateSqlFor(
  citationAlias: string,
  version: BudgetVersion,
): string {
  if (!KNOWN_BUDGET_VERSIONS.includes(version)) {
    throw new Error(`Unknown budget version: ${version}`);
  }
  return membershipPredicate(citationAlias, `'${version}'`);
}

/**
 * EXISTS predicate restricting a citation row to the current budget version.
 * Inline this with `AND` in WHERE clauses.
 */
export function versionPredicateSql(citationAlias: string): string {
  return membershipPredicate(
    citationAlias,
    "COALESCE(NULLIF(current_setting('app.budget_version', true), ''), 'ppb2026')",
  );
}

/**
 * The Plan Outline 2026-2028 strategic framework. It is tagged to both version
 * groups but its citations are not attributed to specific entities, so it must
 * be excluded from entity-level analysis (e.g. the co-citation heatmap) and
 * sits outside the official "active mandates" definition (PPB + PKM only).
 */
export const PLAN_OUTLINE_DOC_SLUG = "plan-outline-a80-6";

/**
 * Predicate excluding Plan Outline citations. Data-driven via the
 * budget_documents match_pattern (no hardcoded regex). Inline with `AND`.
 */
export function excludePlanOutlineSql(citationAlias: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM ppb2026.budget_documents po
    WHERE po.slug = '${PLAN_OUTLINE_DOC_SLUG}'
      AND ${citationAlias}.origin_document ~ po.match_pattern
  )`;
}

/** Match membership on one citation row. Never inherit the registry default. */
function membershipPredicate(alias: string, versionSql: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias))
    throw new Error("Invalid SQL alias");
  return `${alias}.origin_document IN (
    SELECT o.origin_document
    FROM (SELECT DISTINCT origin_document FROM ppb2026.source_document_citations
          WHERE origin_document IS NOT NULL) o
    JOIN ppb2026.budget_documents bd ON o.origin_document ~ bd.match_pattern
    JOIN ppb2026.budget_document_versions bdv ON bdv.doc_slug = bd.slug
    WHERE bdv.version_slug = ${versionSql}
  )`;
}
