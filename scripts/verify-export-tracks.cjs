/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS verification script. */
// Offline checks of real export/track code with mock database and source data.
// Run from the repository root: node scripts/verify-export-tracks.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, deps) {
  const out = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  new Function("exports", "require", code)(out, (n) => {
    if (n in deps) return deps[n];
    throw Error(n);
  });
  return out;
}
const tracks = load("src/features/mandates/services/decision-tracks.ts", {});
let decisions = [];
const records = [
  {
    full_document_symbol: "A/RES/1/1",
    description: "Original",
    uniform_title: null,
    body: "GA",
    type: "Resolution",
    year: 2020,
    link: "https://example.org",
    citation_info: [
      {
        entity: "TEST",
        entity_long: "Test",
        part_in_document: "Legislative mandates",
        "sub-programme": "SP",
      },
    ],
  },
];
const api = load("src/features/mandates/services/export/applied-state.ts", {
  "@/lib/db/db": { query: async () => decisions },
  "@/features/mandates/services/data-service": {
    fetchPPBRecords: async () => records,
  },
  "@/features/mandates/services/decision-tracks": tracks,
  "@/features/mandates/services/documents/metadata": {
    fetchDocumentMetadata: async (symbols) =>
      Object.fromEntries(
        symbols.map((s) => [s, { title: s, body: "GA", year: 2024 }]),
      ),
    cleanTitle: (s) => s,
  },
});
function event(id, track, decision, extra = {}) {
  return {
    id,
    document_symbol: "A/RES/1/1",
    entity: "TEST",
    subprogramme: "SP",
    decision,
    decision_track: track,
    reviewed_submission_id: null,
    review_session_id: null,
    new_symbol: null,
    manual_metadata: null,
    ...extra,
  };
}
(async () => {
  decisions = [event("e1", "entity", "remove")];
  assert.equal(
    (await api.getAppliedExportData("TEST", "entity")).rows.length,
    0,
  );
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.length,
    0,
  );
  assert.equal(await api.getExportFallbackCount("TEST"), 1);
  decisions.push(
    event("r1", "review", "retain", { reviewed_submission_id: "e1" }),
  );
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows[0].symbol,
    "A/RES/1/1",
  );
  assert.equal(
    (await api.getAppliedExportData("TEST", "entity")).rows.length,
    0,
  );
  assert.equal(await api.getExportFallbackCount("TEST"), 0);
  decisions = [
    event("e2", "entity", "update", { new_symbol: "A/RES/2/2" }),
    event("r1", "review", "retain", { reviewed_submission_id: "e1" }),
  ];
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows[0].symbol,
    "A/RES/2/2",
  );
  assert.equal(await api.getExportFallbackCount("TEST"), 1);
  decisions = [
    event("e2", "entity", "update", { new_symbol: "A/RES/2/2" }),
    event("r2", "review", "cancel", { reviewed_submission_id: "e2" }),
  ];
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows[0].symbol,
    "A/RES/2/2",
  );
  decisions = [
    event("e3", "entity", "add", {
      document_symbol: "A/RES/3/3",
      manual_metadata: { title: "Manual title" },
    }),
  ];
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.length,
    2,
  );
  assert.equal(await api.getExportFallbackCount("TEST"), 1);
  decisions[0].has_addition = true;
  decisions.push(
    event("r3", "review", "remove", {
      document_symbol: "A/RES/3/3",
      reviewed_submission_id: "e3",
    }),
  );
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.length,
    1,
  );
  assert.equal(await api.getExportFallbackCount("TEST"), 0);
  decisions[1] = event("r4", "review", "update", {
    document_symbol: "A/RES/3/3",
    reviewed_submission_id: "e3",
    new_symbol: "A/RES/4/4",
    has_addition: true,
  });
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.find(
      (r) => r.symbol === "A/RES/4/4",
    ).title,
    "A/RES/4/4",
  );
  decisions[1] = event("r5", "review", "retain", {
    document_symbol: "A/RES/3/3",
    reviewed_submission_id: "e3",
    has_addition: true,
  });
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.find(
      (r) => r.symbol === "A/RES/3/3",
    ).title,
    "Manual title",
  );
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).decisions.find(
      (d) => d.decisionTrack === "review",
    ).manualMetadata.title,
    "Manual title",
  );
  decisions = [
    event("r6", "review", "update", {
      document_symbol: "A/RES/5/5",
      new_symbol: "A/RES/6/6",
      has_addition: true,
    }),
  ];
  assert.ok(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.some(
      (r) => r.symbol === "A/RES/6/6",
    ),
  );
  decisions = [];
  assert.equal(
    (await api.getAppliedExportData("TEST", "reviewed")).rows.length,
    1,
  );
  console.log(
    "PASS: independent entity/review exports, reviewed fallback, stale and cleared reviews, additions/rejections, no-decision baseline, notice counts",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
