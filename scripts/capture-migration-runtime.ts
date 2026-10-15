import assert from "node:assert/strict";
/** Run only after the operator applies migrations 006–008. No writes are issued.
 * DATABASE_URL_CLAUDE is mandatory. Use the app role, not an administrator.
 * pnpm exec tsx scripts/capture-migration-runtime.ts OUTPUT.json
 */
import { writeFile } from "node:fs/promises";

async function main() {
  const url = process.env.DATABASE_URL_CLAUDE;
  if (!url || !process.argv[2])
    throw new Error("DATABASE_URL_CLAUDE and an output path are required");
  const target = new URL(url);
  if (
    !target.hostname.endsWith(".postgres.database.azure.com") ||
    decodeURIComponent(target.username) !== "mandates_housekeeping_app"
  ) {
    throw new Error("Expected the housekeeping application role on Azure");
  }
  target.searchParams.set("options", "-c default_transaction_read_only=on");
  process.env.DATABASE_URL = target.toString();
  const { withBudgetVersion } = await import("../src/lib/db/review-cycle");
  const { query, pool, withReadOnlyDatabase } =
    await import("../src/lib/db/db");
  const { fetchPPBRecords } =
    await import("../src/features/mandates/services/data-service");
  const { getAppliedExportData } =
    await import("../src/features/mandates/services/export/applied-state");
  const { getParagraphsBySymbol } =
    await import("../src/features/mandates/services/documents/paragraphs");
  const { isContentElement, resolveVisibilityTier } =
    await import("../src/features/mandates/services/documents/paragraph-presentation");
  const { readdir, readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const before = JSON.parse(
    await readFile(".migration-baseline/before.json", "utf8"),
  );
  const output = await withReadOnlyDatabase(() =>
    withBudgetVersion("ppb2026", async () => {
      const identity = await query(
        "SELECT current_user AS role, current_database() AS database, current_setting('transaction_read_only') AS read_only",
      );
      assert.equal(identity[0].role, "mandates_housekeeping_app");
      assert.equal(identity[0].read_only, "on");
      const records = await fetchPPBRecords();
      const applied = await getAppliedExportData();
      const effectiveDecisions =
        await query(`SELECT DISTINCT ON (entity, document_symbol, coalesce(subprogramme,'')) *
        FROM mandates_housekeeping.mandate_decisions
        ORDER BY entity, document_symbol, coalesce(subprogramme,''), created_at DESC, id DESC`);
      const tables = {
        decisions: "mandate_decisions",
        comments: "mandate_comments",
        sessions: "entity_review_mode",
        responses: "review_change_responses",
        uploads: "docx_uploads",
      };
      const history: Record<string, unknown> = {
        citations: (
          await query<{ row: Record<string, unknown> }>(
            "SELECT to_jsonb(t) AS row FROM ppb2026.source_document_citations t ORDER BY id",
          )
        ).map((r) => r.row),
      };
      for (const [key, table] of Object.entries(tables))
        history[key] = (
          await query<{ row: Record<string, unknown> }>(
            `SELECT to_jsonb(t) AS row FROM mandates_housekeeping.${table} t ORDER BY id`,
          )
        ).map((r) => r.row);
      const disabledCycle = await withBudgetVersion("ppb2027", async () => {
        const visible: Record<string, unknown> = {};
        for (const [key, table] of Object.entries(tables))
          visible[key] = (
            await query<{ row: Record<string, unknown> }>(
              `SELECT to_jsonb(t) AS row FROM mandates_housekeeping.${table} t ORDER BY id`,
            )
          ).map((r) => r.row);
        const records = await fetchPPBRecords();
        return { history: visible, records };
      });
      const fulltext = [];
      const inventory = JSON.parse(
        await readFile(
          ".migration-baseline/static-fulltext-inventory.json",
          "utf8",
        ),
      ) as { file: string; candidates: string[] }[];
      for (const file of (await readdir("public/data/paragraphs"))
        .filter((f) => f.endsWith(".json"))
        .sort()) {
        const raw = await readFile(`public/data/paragraphs/${file}`, "utf8");
        // Filename encoding is not reversible (both slashes and spaces became _).
        // Use the original source identities recorded in the total inventory.
        const candidates =
          inventory.find((row) => row.file === file)?.candidates ?? [];
        const normalized = new Set(
          candidates.map((s) => s.replace(/\s/g, "").toUpperCase()),
        );
        const symbol = normalized.size === 1 ? candidates[0] : null;
        const old = JSON.parse(raw) as { text: string; type: string }[];
        const paragraphs = symbol ? await getParagraphsBySymbol(symbol) : [];
        const tier = resolveVisibilityTier(paragraphs);
        const visible = paragraphs.filter((p) => isContentElement(p, tier));
        const readable = visible.some(
          (p) => p.type !== "heading" && p.type !== "opening",
        );
        const oldVisible = old.filter(
          (p) =>
            p.text.trim() && (p.type === "heading" || p.type === "paragraph"),
        );
        const signature = (rows: { text: string; type: string }[]) =>
          JSON.stringify(
            rows.map((p) => ({
              text: p.text.trim(),
              type: p.type,
              ...Object.fromEntries(
                [
                  "prefix",
                  "heading_level",
                  "paragraph_level",
                  "paragraph_type",
                  "section",
                  "annex_index",
                  "text_index",
                  "links",
                  "note_ids",
                  "note_references",
                ].map((k) => [
                  k,
                  (p as unknown as Record<string, unknown>)[k] ?? null,
                ]),
              ),
            })),
          );
        fulltext.push({
          file,
          symbol,
          sha256: createHash("sha256").update(raw).digest("hex"),
          status: !readable
            ? !symbol || /\[/.test(symbol)
              ? "ambiguous_or_unavailable"
              : "unavailable"
            : signature(oldVisible) === signature(visible)
              ? "equivalent"
              : "changed",
          paragraphCount: paragraphs.length,
          visibleCount: visible.length,
          qualityWarning: paragraphs.some((p) => p.extraction_quality_warning),
        });
      }
      return {
        identity,
        records,
        applied,
        effectiveDecisions,
        history,
        disabledCycle,
        fulltext,
        baselineCapturedAt: before.captured_at,
      };
    }),
  );
  await writeFile(process.argv[2], JSON.stringify(output), { flag: "wx" });
  await pool.end();
  console.log(
    "Runtime snapshot captured with the app role in read-only transactions",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Runtime capture failed",
  );
  process.exitCode = 1;
});
