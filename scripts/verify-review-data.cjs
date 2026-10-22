/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression checks. */
// Run: node scripts/verify-review-data.cjs. Uses actual service code with no DB access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const result = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  new Function("exports", "require", code)(result, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return result;
}
const base = "src/features/mandates/services/";
const identity = load(base + "citation-identity.ts");
const tracks = load(base + "decision-tracks.ts");
let records = [],
  decisions = [];
const metadata = {
  cleanTitle: (value) => value,
  fetchDocumentMetadata: async () => ({}),
};
const applied = load(base + "export/applied-state.ts", {
  "../citation-identity": identity,
  "@/lib/db/db": { query: async () => decisions },
  "@/features/mandates/services/decision-tracks": tracks,
  "@/features/mandates/services/data-service": {
    fetchPPBRecords: async () => records,
  },
  "@/features/mandates/services/documents/metadata": metadata,
});
const analysis = load(base + "analysis-service.ts", {
  "@/lib/db/db": {
    query: async () =>
      records.flatMap((record) =>
        record.citation_info.map((ci) => ({
          symbol: record.full_document_symbol,
          entity: ci.entity,
          entity_long: "Test entity",
          sub_programme: ci["sub-programme"],
          component: ci.component,
          part_in_document: ci.part_in_document,
        })),
      ),
  },
  "./citation-identity": identity,
  "./decision-tracks": tracks,
  "./export/applied-state": applied,
  "@/lib/db/budget-version": { versionPredicateSql: () => "true" },
});
function source(
  symbol,
  programme = null,
  part = "Legislative mandates",
  entity = "TEST",
  component = null,
) {
  return {
    full_document_symbol: symbol,
    description: symbol,
    citation_info: [
      {
        entity,
        "sub-programme": programme,
        component,
        part_in_document: part,
      },
    ],
  };
}
function event(id, symbol, decision, programme, extra = {}) {
  return {
    id,
    document_symbol: symbol,
    entity: "TEST",
    subprogramme: programme,
    decision,
    decision_track: "entity",
    created_at: `2026-01-0${id}T00:00:00Z`,
    ...extra,
  };
}
(async () => {
  records = [source("A/RES/1/1")];
  decisions = [event("1", "A/RES/1/1", "remove", "Legislative mandates")];
  assert.equal((await applied.getAppliedExportData("TEST")).rows.length, 0);
  assert.equal(await applied.getExportFallbackCount("TEST"), 1);
  assert.equal(
    (await analysis.fetchAnalysisData()).overall.projectedCitations,
    0,
  );
  decisions = [event("1", "A/RES/1/1", "remove", null)];
  assert.equal(
    (await applied.getAppliedExportData("TEST")).rows.length,
    0,
    "Legacy null programme key",
  );
  records.push(
    source("A/RES/1/1", "Ignored for background", "Mandates and background"),
  );
  assert.equal(
    (await applied.getAppliedExportData("TEST")).rows.length,
    1,
    "Background remove must not remove programme-level citation",
  );
  let stats = (await analysis.fetchAnalysisData()).overall;
  assert.equal(stats.totalCitations, 2);
  assert.equal(stats.projectedCitations, 1);

  records = [
    source("A/RES/1/1", null, undefined, "TEST", "Component 1"),
    source("A/RES/1/1", null, undefined, "TEST", "Component 1"),
  ];
  decisions = [
    event("1", "A/RES/1/1", "update", "Component 1", {
      new_symbol: "A/RES/2/2",
    }),
  ];
  stats = (await analysis.fetchAnalysisData()).overall;
  assert.equal(
    stats.totalCitations,
    1,
    "Duplicate source locations count once",
  );
  assert.equal(stats.citationsWithDecisions, 1);
  assert.equal(stats.projectedUniqueDocuments, 1);
  assert.deepEqual(
    (await applied.getAppliedExportData("TEST")).rows.map((r) => r.symbol),
    ["A/RES/2/2"],
  );
  records.push(source("A/RES/2/2", null, undefined, "TEST", "Component 1"));
  stats = (await analysis.fetchAnalysisData()).overall;
  assert.equal(stats.totalUniqueDocuments, 2);
  assert.equal(
    stats.projectedUniqueDocuments,
    1,
    "Updating onto an existing document merges symbols",
  );
  assert.equal(
    stats.projectedCitations,
    1,
    "Updating onto an existing review item merges citations",
  );
  records.push(source("A/RES/1/1", "SP", undefined, "OTHER"));
  assert.equal(
    (await analysis.fetchAnalysisData()).overall.projectedUniqueDocuments,
    2,
    "Original remains when another entity still cites it",
  );
  decisions = [event("1", "A/RES/1/1", "remove", "Component 1")];
  assert.equal((await analysis.fetchAnalysisData()).overall.totalCitations, 3);

  let csvRows = [];
  const csv = load(base + "export/export-excel.ts", {
    exceljs: {},
    "@/features/mandates/services/export/applied-state": {
      getAppliedExportData: async () => ({ rows: csvRows, decisions: [] }),
    },
    "@/lib/get-base-url": {},
    "@/features/mandates/services/documents/metadata": metadata,
  });
  for (const value of [
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(1)",
    "  =1+1",
    "\t=1+1",
    "\r=1+1",
    "\n=1+1",
  ]) {
    csvRows = [
      {
        symbol: value,
        title: value,
        body: value,
        link: value,
        entity: value,
        entityLong: value,
        subprogramme: value,
        part: value,
      },
    ];
    const output = await csv.exportToCsv();
    assert.ok(
      output
        .split("\n")[1]
        .startsWith(value.includes("\r") || value.includes("\n") ? "\"'" : "'"),
      `Unsafe CSV prefix: ${JSON.stringify(value)}`,
    );
  }
  csvRows = [
    {
      symbol: "A/RES/1/1",
      title: "Safe",
      body: "GA",
      year: "=1+1",
      entity: "TEST",
    },
  ];
  assert.ok(
    (await csv.exportToCsv()).includes(",'=1+1,"),
    "Year passes through the same CSV sanitizer",
  );
  csvRows = [
    {
      symbol: "A/RES/1/1",
      title: 'Title, with "quotes"\rand a return',
      body: "GA",
      entity: "TEST",
    },
  ];
  assert.ok(
    (await csv.exportToCsv()).includes(
      '"Title, with ""quotes""\rand a return"',
    ),
  );
  console.log(
    "PASS: programme and legacy keys, background separation, component and duplicate locations, update/merge projections, CSV formula protection and escaping",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
