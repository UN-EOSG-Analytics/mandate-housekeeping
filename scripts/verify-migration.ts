/** Total reconciliation checks. Never connects to a database or mutates state.
 * pnpm exec tsx scripts/verify-migration.ts [runtime-snapshot.json]
 * The optional snapshot must be captured by capture-migration-runtime.ts after
 * manual migration application. Offline checks are never deployment evidence.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import ts from "typescript";
import {
  isolateBracketPart,
  parseBracketPart,
  isContentElement,
  resolveVisibilityTier,
  shouldCollapsePreamble,
} from "../src/features/mandates/services/documents/paragraph-presentation";
import { hasFulltextQualityWarning } from "../src/features/mandates/services/documents/fulltext-quality";
import { synthesizeDlAnnotations } from "../src/features/mandates/services/documents/fulltext-annotations";
import { versionPredicateSqlFor } from "../src/lib/db/budget-version";

type Row = Record<string, unknown>;
type History = Record<string, Row[]>;
const workflow = {
  decisions: "mandate_decisions",
  comments: "mandate_comments",
  sessions: "entity_review_mode",
  responses: "review_change_responses",
  uploads: "docx_uploads",
};
const canonical = (value: unknown, key = ""): unknown => {
  if (Array.isArray(value)) return value.map((v) => canonical(v));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v, k)]),
    );
  if (
    typeof value === "string" &&
    /(?:_at|At)$/.test(key) &&
    !Number.isNaN(Date.parse(value))
  )
    return new Date(value).toISOString();
  return value;
};
function rowMap(rows: Row[], stripVersion = false) {
  return new Map(
    rows.map((row) => {
      assert(
        ["string", "number"].includes(typeof row.id),
        "Every historical row needs an ID",
      );
      // pg returns bigint IDs as strings, while JSONB preserves numeric IDs.
      const copy = { ...row, id: String(row.id) } as Row;
      if (stripVersion) delete copy.budget_version;
      return [String(row.id), JSON.stringify(canonical(copy))];
    }),
  );
}
function conserve(before: History, after: History) {
  for (const key of ["citations", ...Object.keys(workflow)]) {
    const old = before[key] ?? [];
    const next = after[key] ?? [];
    assert.equal(
      rowMap(old).size,
      old.length,
      `Duplicate baseline IDs: ${key}`,
    );
    assert.equal(
      rowMap(next).size,
      next.length,
      `Duplicate output IDs: ${key}`,
    );
    assert.deepEqual(
      rowMap(old),
      rowMap(next, key !== "citations"),
      `Full historical row/ID mismatch: ${key}`,
    );
    if (key !== "citations")
      assert(
        next.every((r) => r.budget_version === "ppb2026"),
        `Old-cycle rows reassigned: ${key}`,
      );
  }
}
function citationRows(records: Row[]): Row[] {
  return records.flatMap((record) =>
    (record.citation_info as Row[]).map((citation) => ({
      ...citation,
      full_document_symbol: record.full_document_symbol,
    })),
  );
}
function expectedCitationRows(citations: Row[]): Row[] {
  return citations.map((c) => ({
    id: c.id,
    full_document_symbol: c.ppb_full_document_symbol,
    subprogramme_number: c.sub_programme_number,
    origin_document: c.origin_document ?? "",
    budget_part: c.budget_part,
    section: c.section,
    section_title: c.section_title,
    entity_long: c.entity_long,
    entity: c.entity,
    programme: c.programme,
    programme_title: c.programme_title,
    "sub-programme": c.sub_programme,
    component: c.component,
    part_in_document: c.part_in_document,
  }));
}
function conserveCitations(expected: Row[], records: Row[]) {
  const actual = citationRows(records);
  assert.equal(
    actual.length,
    expected.length,
    "Citation multiset size changed",
  );
  // entity_long is supplied by systemchart.entities, not the citation source row.
  const withoutDisplayName = (rows: Row[]) =>
    rows.map((row) => {
      const r = { ...row };
      delete r.entity_long;
      return r;
    });
  assert.deepEqual(
    rowMap(withoutDisplayName(expected)),
    rowMap(withoutDisplayName(actual)),
    "Citation IDs/locations/provenance changed",
  );
}
function metadataFloor(
  before: Row[],
  after: Row[],
  key: (r: Row) => string,
  fields: string[],
) {
  const next = new Map(after.map((r) => [key(r), r]));
  assert.equal(next.size, after.length, "Output keys must be unique");
  assert.deepEqual(
    new Set(before.map(key)),
    new Set(next.keys()),
    "Resolved row keys changed",
  );
  const changes: Row[] = [];
  for (const row of before) {
    const value = next.get(key(row))!;
    for (const field of fields) {
      const was = row[field],
        now = value[field];
      if (was !== null && was !== undefined && was !== "")
        assert(
          now !== null && now !== undefined && now !== "",
          `New NULL ${key(row)}.${field}`,
        );
      if (was !== now)
        changes.push({ key: key(row), field, before: was, after: now });
    }
  }
  return changes;
}
function negative(name: string, check: () => void) {
  assert.throws(check, `Negative control failed to detect: ${name}`);
  return name;
}
async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}
function validatePolicies(sql: string) {
  for (const table of Object.values(workflow)) {
    assert(
      sql.includes(
        `ALTER TABLE mandates_housekeeping.${table} FORCE ROW LEVEL SECURITY`,
      ),
      `RLS missing: ${table}`,
    );
    for (const action of ["SELECT", "INSERT", "UPDATE", "DELETE"])
      assert(
        new RegExp(
          `CREATE POLICY \\w+ ON mandates_housekeeping\\.${table} FOR ${action}`,
        ).test(sql),
        `Policy missing: ${table} ${action}`,
      );
  }
}
async function main() {
  const before = await readJson(".migration-baseline/before.json");
  const references = await readJson(
    ".migration-baseline/reference-before.json",
  );
  const catalogue = await readJson(".migration-baseline/catalogue-before.json");
  const exportsBefore = await readJson(
    ".migration-baseline/exports-before.json",
  );
  const projected: History = { citations: before.citations };
  for (const key of Object.keys(workflow))
    projected[key] = (before[key] ?? []).map((r: Row) => ({
      ...r,
      budget_version: "ppb2026",
    }));
  conserve(before, projected);
  const negativeControls = [
    negative("remove historical record", () =>
      conserve(before, {
        ...projected,
        decisions: projected.decisions.slice(1),
      }),
    ),
    negative("swap a historical cycle", () =>
      conserve(before, {
        ...projected,
        decisions: projected.decisions.map((r, i) =>
          i === 0 ? { ...r, budget_version: "ppb2027" } : r,
        ),
      }),
    ),
    negative("rewrite replacement symbol", () =>
      conserve(before, {
        ...projected,
        decisions: projected.decisions.map((r, i) =>
          i === 0 ? { ...r, new_symbol: "WRONG/ISSUER/4/6" } : r,
        ),
      }),
    ),
    negative("lose an old metadata field", () =>
      metadataFloor(
        [{ id: "x", title: "Title" }],
        [{ id: "x", title: null }],
        (r) => String(r.id),
        ["title"],
      ),
    ),
    negative("lose a type-only record", () =>
      metadataFloor(
        [{ id: "x", docType: "Conventions" }],
        [],
        (r) => String(r.id),
        ["docType"],
      ),
    ),
  ];
  const sql = await readFile(
    "sql/migrations/006_review_cycle_isolation.sql",
    "utf8",
  );
  validatePolicies(sql);
  negativeControls.push(
    negative("omit workflow RLS", () =>
      validatePolicies(
        sql.replace(
          "docx_uploads FORCE ROW LEVEL SECURITY",
          "docx_uploads DISABLE ROW LEVEL SECURITY",
        ),
      ),
    ),
  );
  const actionFiles = [
    "decisions",
    "comments",
    "review-mode",
    "review-baselines",
  ];
  const gatedActions: string[] = [];
  for (const file of actionFiles) {
    const text = await readFile(
      `src/features/mandates/actions/${file}.ts`,
      "utf8",
    );
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements)
      if (ts.isFunctionDeclaration(node) && node.body) {
        const body = node.body.getText(ast);
        if (
          /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+mandates_housekeeping\./i.test(
            body,
          )
        ) {
          assert(
            body.includes("getReviewWriteError(expectedBudgetVersion)"),
            `Ungated action: ${node.name?.text}`,
          );
          assert(
            body.indexOf("getReviewWriteError(expectedBudgetVersion)") <
              body.indexOf("getCurrentUser()"),
            "Gate must precede all side effects",
          );
          gatedActions.push(node.name!.text);
        }
      }
  }
  assert.equal(
    gatedActions.length,
    10,
    "All ten workflow mutation actions must be inspected",
  );
  const paragraphSource = await readFile(
    "src/features/mandates/services/documents/paragraphs.ts",
    "utf8",
  );
  assert(
    paragraphSource.includes("files.status = 'parsed'") &&
      paragraphSource.includes("JOIN digitallibrary.document_parses") &&
      paragraphSource.includes("dp.lang = 'en'"),
    "Successful English parse contract",
  );
  assert(
    !paragraphSource.includes("FROM mandates.paragraphs"),
    "No mixed legacy reader",
  );
  const heading = (text: string, index: number) => ({
    type: "heading",
    subtype: "subres",
    text,
    text_index: index,
  });
  const body = { type: "paragraph", text: "Requests action", text_index: 1 };
  const parts = [
    heading("A", 1),
    body,
    heading("B", 2),
    { ...body, text_index: 2 },
  ];
  assert.equal(isolateBracketPart(parts, "A").length, 2);
  const ambiguous = [...parts, heading("A", 3)];
  assert.deepEqual(isolateBracketPart(ambiguous, "A"), []);
  negativeControls.push(
    negative("ambiguous printed part accepted as exact", () =>
      assert(isolateBracketPart(ambiguous, "A").length > 0),
    ),
  );
  assert.deepEqual(isolateBracketPart([...parts, heading("B", 1)], "A"), []);
  assert.equal(parseBracketPart("A/RES/1/2[A-B]"), null);
  assert.equal(parseBracketPart(" A/RES/1/2 [A] ")?.letter, "A");
  const neutral = {
    type: "article",
    text: "Substantive adopted instrument",
    section: "annex",
  };
  assert(isContentElement(neutral, resolveVisibilityTier([neutral])));
  assert(
    !isContentElement(
      { type: "frontmatter", subtype: "masthead", text: "United Nations" },
      "title",
    ),
  );
  assert(
    !shouldCollapsePreamble([
      { type: "paragraph", text: "Recalling", paragraph_type: "preambular" },
    ]),
  );
  assert(hasFulltextQualityWarning([{ problem: "uncertain_marker" }]));
  assert(
    !hasFulltextQualityWarning([
      { problem: "source_unchecked" },
      { problem: "source_unreadable" },
      { problem: "other", severity: "info" },
    ]),
  );
  assert.equal(
    synthesizeDlAnnotations({ text: "We will act", action_verb: "We" }),
    null,
  );
  const annotation = synthesizeDlAnnotations({
    text: "Requests the Secretary-General to report",
    action_verb: "Requests",
    assignee: "the Secretary-General",
  });
  assert(annotation?.textWithHighlights?.includes("*Requests*"));
  assert.deepEqual(annotation?.mandates?.[0].mentioned_entities, []);
  assert(versionPredicateSqlFor("c", "ppb2026").includes("'ppb2026'"));
  negativeControls.push(
    negative("unallowlisted budget version", () =>
      versionPredicateSqlFor("c", "ppb2028" as "ppb2026"),
    ),
  );
  const byAsset = new Map<string, Set<string>>();
  const symbols = new Set<string>([
    ...catalogue.legacy_documents.map((r: Row) => String(r.symbol)),
    ...references.source_documents.map((r: Row) =>
      String(r.ppb_full_document_symbol),
    ),
    ...before.citations.map((r: Row) => String(r.ppb_full_document_symbol)),
    ...before.decisions
      .flatMap((r: Row) => [r.document_symbol, r.new_symbol])
      .filter(Boolean),
  ]);
  for (const symbol of symbols) {
    const asset = (
      symbol.replace(/\//g, "_").replace(/ /g, "_").toUpperCase() + ".JSON"
    ).replace(/_\(/g, "(");
    const set = byAsset.get(asset) ?? new Set();
    set.add(symbol);
    byAsset.set(asset, set);
  }
  const staticFiles = await readdir("public/data/paragraphs");
  const inventory = [];
  for (const file of staticFiles.filter((f) => f.endsWith(".json")).sort()) {
    const raw = await readFile(`public/data/paragraphs/${file}`);
    const candidates = [
      ...(byAsset.get(file.toUpperCase().replace(/_\(/g, "(")) ?? []),
    ];
    inventory.push({
      file,
      candidates,
      sha256: createHash("sha256").update(raw).digest("hex"),
      status: "blocked_missing_runtime_grants",
    });
  }
  const sourceKeys = new Set(
    references.source_documents.map((r: Row) => r.ppb_full_document_symbol),
  );
  const legacyKeys = new Set(
    catalogue.legacy_documents.map((r: Row) =>
      String(r.symbol).replace(/\s/g, "").toUpperCase(),
    ),
  );
  const unresolvedReviewKeys = [];
  for (const key of ["decisions", "comments", "responses"])
    for (const row of before[key] ?? []) {
      for (const field of key === "decisions"
        ? ["document_symbol", "new_symbol"]
        : ["document_symbol"]) {
        const symbol = row[field];
        if (!symbol) continue;
        // Historic ambiguous keys are reported, never guessed or rewritten.
        if (/^\d+\/\d+$/.test(String(symbol).trim())) {
          unresolvedReviewKeys.push({
            table: key,
            id: row.id,
            field,
            symbol,
            classification: "ambiguous_numeric_issuer_preserved",
          });
          continue;
        }
        if (
          !sourceKeys.has(symbol) &&
          !legacyKeys.has(String(symbol).replace(/\s/g, "").toUpperCase())
        )
          unresolvedReviewKeys.push({
            table: key,
            id: row.id,
            field,
            symbol,
            classification: row.manual_metadata
              ? "manual_metadata_preserved"
              : "external_or_manual_identity_requires_catalogue_check",
          });
      }
    }
  const citationGroups = new Map<string, Row[]>();
  for (const citation of before.citations as Row[]) {
    const key = String(citation.ppb_full_document_symbol);
    const rows = citationGroups.get(key) ?? [];
    rows.push(citation);
    citationGroups.set(key, rows);
  }
  const multiCitation = [...citationGroups.values()].find(
    (rows) => rows.length > 1,
  )!;
  const citationFixture = expectedCitationRows(multiCitation.slice(0, 2));
  const fixtureRecords = [
    {
      full_document_symbol: citationFixture[0].full_document_symbol,
      citation_info: citationFixture.map((r) => {
        const c = { ...r };
        delete c.full_document_symbol;
        return c;
      }),
    },
  ];
  conserveCitations(citationFixture, fixtureRecords);
  negativeControls.push(
    negative("alter exact citation section", () =>
      conserveCitations(citationFixture, [
        {
          ...fixtureRecords[0],
          citation_info: fixtureRecords[0].citation_info.map((r, i) =>
            i === 0 ? { ...r, section: "WRONG ADDENDUM" } : r,
          ),
        },
      ]),
    ),
  );
  negativeControls.push(
    negative("remove one citation while retaining its document", () =>
      conserveCitations(citationFixture, [
        {
          ...fixtureRecords[0],
          citation_info: (fixtureRecords[0].citation_info as Row[]).slice(1),
        },
      ]),
    ),
  );

  // Exercise actual disabled-cycle actions. Any DB acquisition is a test failure:
  // every entry point must reject before auth queries or a mutation can run.
  process.env.DATABASE_URL ||=
    "postgresql://offline.invalid/disabled_review_check?sslmode=require";
  const { withBudgetVersion, getReviewWriteError, getBudgetVersion } =
    await import("../src/lib/db/review-cycle");
  const { pool } = await import("../src/lib/db/db");
  const decisions = await import("../src/features/mandates/actions/decisions");
  const comments = await import("../src/features/mandates/actions/comments");
  const mode = await import("../src/features/mandates/actions/review-mode");
  const responses =
    await import("../src/features/mandates/actions/review-baselines");
  const { transformPPBData, collectEntityData } =
    await import("../src/features/mandates/services/data-service");
  const location = exportsBefore.records[0].citation_info[0];
  const hierarchyFixture = {
    ...exportsBefore.records[0],
    citation_info: [
      {
        ...location,
        id: "location-1",
        entity: "TEST",
        budget_part: "part-a",
        section: "3",
        "sub-programme": "All Subprogrammes",
      },
      {
        ...location,
        id: "location-2",
        entity: "TEST",
        budget_part: "part-b",
        section: "3/Add.1",
        "sub-programme": "All Subprogrammes",
      },
    ],
  };
  const combined = collectEntityData(
    transformPPBData([hierarchyFixture], []),
    "TEST",
  );
  assert(combined, "Entity spanning parts must remain visible");
  const combinedLocations = [
    ...combined.data.backgroundMandates,
    ...Object.values(combined.data.legislativeMandates).flat(),
  ].flatMap((m) => m.citationLocations ?? []);
  assert.equal(
    combinedLocations.length,
    2,
    "Entity locations across parts must not be duplicated",
  );
  assert.deepEqual(
    new Set(combinedLocations.map((l) => l.section)),
    new Set(["3", "3/Add.1"]),
    "Exact section/addendum lost",
  );

  const originalConnect = pool.connect;
  pool.connect = (() => {
    throw new Error("Disabled-cycle action tried to acquire a DB connection");
  }) as typeof pool.connect;
  const reviewParams = {
    entity: "TEST",
    documentSymbol: "A/RES/1/1",
    subprogramme: null,
    reviewSessionId: "missing",
  };
  const calls: (() => Promise<
    { success: true; data?: unknown } | { success: false; error: string }
  >)[] = [
    () =>
      decisions.createDecisionAction({ ...reviewParams, decision: "retain" }),
    () => decisions.approveDecisionAction("missing", true),
    () =>
      decisions.updateDecisionReasonAction({
        decisionId: "missing",
        decisionReason: null,
        otherReason: null,
      }),
    () => decisions.clearAllEntityDecisionsAction("TEST"),
    () => comments.createCommentAction({ ...reviewParams, comment: "test" }),
    () => comments.resolveCommentAction("missing", true),
    () => mode.startReviewModeAction("TEST"),
    () => mode.endReviewModeAction("TEST"),
    () => responses.acceptReviewChangeAction(reviewParams),
    () => responses.revertReviewChangeAction(reviewParams),
  ];
  try {
    for (const call of calls) {
      const result = await withBudgetVersion("ppb2026", call);
      assert(
        !result.success && /read-only/.test(result.error),
        "Disabled-cycle action was accepted",
      );
    }
    // Old bundles omit the originating cycle. They must never write into the
    // newly active review after a cookie reset or an existing-tab cycle switch.
    for (const call of calls) {
      const result = await withBudgetVersion("ppb2027", call);
      assert(
        !result.success && /Reload this page/.test(result.error),
        "Stale-page action was accepted",
      );
    }
    await withBudgetVersion("ppb2027", async () => {
      assert.equal(await getBudgetVersion(), "ppb2027");
      assert.equal(await getReviewWriteError("ppb2027"), null);
      assert.match((await getReviewWriteError("ppb2026"))!, /Reload this page/);
    });
  } finally {
    pool.connect = originalConnect;
    await pool.end();
  }

  const report: Row = {
    scope:
      "Offline total checks; live reader validation is blocked until migrations/grants are manually applied",
    counts: Object.fromEntries(
      ["citations", ...Object.keys(workflow), "effective_decisions"].map(
        (k) => [k, (before[k] ?? []).length],
      ),
    ),
    resolvedRecords: exportsBefore.records.length,
    appliedExportRows: exportsBefore.applied.rows.length,
    staticAssets: inventory.length,
    staticAssetsWithUnresolvedFilename: inventory.filter(
      (r) =>
        new Set(r.candidates.map((s) => s.replace(/\s/g, "").toUpperCase()))
          .size !== 1,
    ).length,
    grants: before.grants,
    negativeControls,
    gatedActions,
    disabledCycleActionsRejectedWithoutDatabase: calls.length,
    stalePageActionsRejectedWithoutDatabase: calls.length,
    unresolvedReviewKeys: unresolvedReviewKeys.length,
    ambiguousNumericHistoryReferences: unresolvedReviewKeys.filter(
      (r) => r.classification === "ambiguous_numeric_issuer_preserved",
    ).length,
    offlineVerdict: "PASS",
    runtimeVerdict: "BLOCKED",
  };
  if (process.argv[2]) {
    const after = await readJson(process.argv[2]);
    assert.equal(after.identity[0].role, "mandates_housekeeping_app");
    assert.equal(after.identity[0].read_only, "on");
    assert.equal(
      after.baselineCapturedAt,
      before.captured_at,
      "Wrong baseline snapshot",
    );
    conserve(before, after.history);
    assert.deepEqual(
      rowMap(before.effective_decisions),
      rowMap(after.effectiveDecisions, true),
      "Effective old-cycle decision IDs/provenance changed",
    );
    assert.deepEqual(
      rowMap(
        exportsBefore.applied.decisions.map((r: Row) => ({ ...r, id: r.id })),
      ),
      rowMap(after.applied.decisions),
      "Effective decision export history changed",
    );
    const recordKey = (r: Row) => String(r.full_document_symbol);
    report.metadataChanges = metadataFloor(
      exportsBefore.records,
      after.records,
      recordKey,
      ["description", "year", "body", "type", "link"],
    );
    const appliedKey = (r: Row) =>
      JSON.stringify([r.entity, r.symbol, r.subprogramme, r.part]);
    report.exportFieldChanges = metadataFloor(
      exportsBefore.applied.rows,
      after.applied.rows,
      appliedKey,
      ["title", "year", "body", "docType", "link"],
    );
    for (const key of Object.keys(workflow)) {
      const oldIds = new Set((before[key] ?? []).map((r: Row) => r.id));
      assert(
        after.disabledCycle.history[key].every(
          (r: Row) => r.budget_version === "ppb2027" && !oldIds.has(r.id),
        ),
        `Old review visible in PPB2027: ${key}`,
      );
    }
    const eligible = (version: string, origin: string) =>
      references.budget_document_versions
        .filter((v: Row) => v.version_slug === version)
        .some((v: Row) =>
          references.budget_documents.some(
            (d: Row) =>
              d.slug === v.doc_slug &&
              new RegExp(String(d.match_pattern)).test(origin),
          ),
        );
    for (const [version, records] of [
      ["ppb2026", after.records],
      ["ppb2027", after.disabledCycle.records],
    ] as const) {
      for (const record of records)
        for (const citation of record.citation_info)
          assert(
            eligible(version, citation.origin_document),
            `Cross-cycle citation: ${version} ${citation.origin_document}`,
          );
      conserveCitations(
        expectedCitationRows(
          before.citations.filter((c: Row) =>
            eligible(version, String(c.origin_document)),
          ),
        ),
        records,
      );
      const expected = new Set(
        before.citations
          .filter((c: Row) => eligible(version, String(c.origin_document)))
          .map((c: Row) => c.ppb_full_document_symbol),
      );
      assert.deepEqual(
        new Set(records.map((r: Row) => r.full_document_symbol)),
        expected,
        `Missing citation symbols: ${version}`,
      );
    }
    assert.deepEqual(
      new Set(after.fulltext.map((r: Row) => r.file)),
      new Set(inventory.map((r) => r.file)),
      "Static fulltext inventory incomplete",
    );
    for (const row of after.fulltext)
      assert.equal(
        row.sha256,
        inventory.find((r) => r.file === row.file)?.sha256,
        `Changed static asset: ${row.file}`,
      );
    assert.equal(
      after.fulltext.length,
      inventory.length,
      "Duplicate fulltext classifications",
    );
    assert(
      after.fulltext.every((r: Row) =>
        [
          "equivalent",
          "changed",
          "unavailable",
          "ambiguous_or_unavailable",
        ].includes(String(r.status)),
      ),
      "Unclassified static fulltext",
    );
    report.fulltextClassifications = Object.fromEntries(
      ["equivalent", "changed", "unavailable", "ambiguous_or_unavailable"].map(
        (k) => [k, after.fulltext.filter((r: Row) => r.status === k).length],
      ),
    );
    report.runtimeVerdict = "PASS_READ_ONLY_CHECKS";
  }
  await writeFile(
    ".migration-baseline/static-fulltext-inventory.json",
    JSON.stringify(inventory, null, 2),
  );
  await writeFile(
    ".migration-baseline/review-identity-residue.json",
    JSON.stringify(unresolvedReviewKeys, null, 2),
  );
  await writeFile(
    ".migration-baseline/validation-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
});
