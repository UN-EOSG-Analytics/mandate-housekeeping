// Offline regression checks for citation warnings, using the real table pipeline.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
function load(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
    return dependencies[name];
  });
  return exports;
}
const root = "src/features/mandates/services/";
const tracks = load(root + "decision-tracks.ts");
const locations = load(root + "citation-locations.ts", {
  "./decision-tracks": tracks,
});
const warnings = load(root + "mandate-warnings.ts", {
  "./citation-locations": locations,
});
const view = load(root + "table-view.ts", {
  "./decision-tracks": tracks,
  "./age-indicator": load(root + "age-indicator.ts"),
});
const old = "A/RES/78/1",
  next = "A/RES/79/1";
const sp1 = "Subprogramme 1",
  sp2 = "Subprogramme 2",
  programme = "Legislative mandates";
function mandate(symbol, changes = {}) {
  return {
    symbol,
    title: symbol,
    link: `https://docs.un.org/en/${symbol}`,
    metadataFromDb: true,
    allEntities: ["OCHA"],
    entitySubprogrammes: {},
    entityLongMap: {},
    allEntityRelevance: {},
    otherEntitiesCount: 0,
    year: 2023,
    body: "GA",
    docType: "Resolution",
    ...changes,
  };
}
function event(decision, changes = {}) {
  return {
    id: "entity",
    createdAt: "2026-10-21T00:00:00Z",
    decision,
    decisionTrack: "entity",
    newSymbol: null,
    ...changes,
  };
}
function item(symbol, subprogramme = sp1, decisions = [], changes = {}) {
  return {
    mandate: mandate(symbol, changes),
    subprogramme,
    entity: "OCHA",
    state: { documentSymbol: symbol, entity: "OCHA", subprogramme, decisions },
  };
}
function check(row, items, id = "duplicate-citation", extra = {}) {
  return warnings
    .getMandateWarnings(row.mandate, undefined, true, {
      citations: locations.buildEntityCitationIndex(items, "OCHA"),
      subprogramme: row.subprogramme,
      ...extra,
    })
    .find((warning) => warning.id === id);
}
function withNewer(row, versions = [{ symbol: next, year: 2024 }]) {
  return {
    ...row,
    mandate: {
      ...row.mandate,
      newerVersion: { ...versions.at(-1), allNewer: versions },
    },
  };
}

test("newer-version warning names same and different subprogrammes, plus programme level", () => {
  const row = withNewer(item(old));
  const warning = check(
    row,
    [row, item(next), item(next, sp2), item(next, programme)],
    "newer-already-cited",
  );
  assert.deepEqual(
    warning.locations.map((l) => l.label),
    [sp1, sp2, "Programme level"],
  );
  assert.match(warning.locations[0].detail, /Same subprogramme/);
  assert.match(warning.locations[1].detail, /Different subprogramme/);
});
test("newest already cited version wins, including updates", () => {
  const latest = "A/RES/80/1";
  const row = withNewer(item(old), [
    { symbol: next, year: 2024 },
    { symbol: latest, year: 2025 },
  ]);
  const warning = check(
    row,
    [
      row,
      item(next),
      item("A/RES/77/1", sp2, [event("update", { newSymbol: latest })]),
    ],
    "newer-already-cited",
  );
  assert.equal(warning.linkedSymbol, latest);
  assert.match(warning.locations[0].detail, /Via update of A\/RES\/77\/1/);
});
test("duplicates name other subprogrammes and only suggest consolidation", () => {
  const row = item(next);
  const warning = check(row, [row, item(next, sp2)]);
  assert.equal(warning.locations[0].label, sp2);
  assert.match(warning.advice, /moving.*programme level/);
  assert.equal(warning.action, undefined);
});
test("new addition detects a programme-level citation", () => {
  const row = item(next, sp1, [event("add")], { isAdded: true });
  const warning = check(row, [row, item(next, programme)]);
  assert.match(warning.message, /added resolution/);
  assert.equal(warning.locations[0].label, "Programme level");
  assert.match(warning.advice, /single citation at programme level/);
});
test("new addition detects another addition in another subprogramme", () => {
  const row = item(next, sp1, [event("add")], { isAdded: true });
  const warning = check(row, [
    row,
    item(next, sp2, [event("add")], { isAdded: true }),
  ]);
  assert.match(warning.locations[0].detail, /Added citation/);
  assert.match(warning.advice, /moving/);
});
test("same-section addition detects a replacement and names its original", () => {
  const row = item(next, sp1, [event("add")], { isAdded: true });
  const warning = check(row, [
    row,
    item(old, sp1, [event("update", { newSymbol: next })]),
  ]);
  assert.match(
    warning.locations[0].detail,
    /Same subprogramme · Via update of A\/RES\/78\/1/,
  );
  assert.equal(warning.advice, undefined);
});
test("an update does not warn about itself as an already-cited newer version", () => {
  const row = withNewer(item(old, sp1, [event("update", { newSymbol: next })]));
  assert.equal(check(row, [row], "newer-already-cited"), undefined);
  assert.equal(
    check(item(next), [row], "duplicate-citation", { sourceSymbol: old }),
    undefined,
  );
});
test("replacement row can warn about a separate direct citation", () => {
  const source = item(old, sp1, [event("update", { newSymbol: next })]);
  const warning = check(
    item(next),
    [source, item(next, sp2)],
    "duplicate-citation",
    { sourceSymbol: old },
  );
  assert.equal(warning.locations[0].label, sp2);
});
test("removals and symbols updated away no longer count; cancelling a source decision restores it", () => {
  const row = item(next);
  assert.equal(
    check(row, [row, item(next, sp2, [event("remove")])]),
    undefined,
  );
  assert.equal(
    check(row, [
      row,
      item(next, sp2, [event("update", { newSymbol: "A/RES/80/2" })]),
    ]),
    undefined,
  );
  assert.ok(check(row, [row, item(next, sp2, [event("cancel")])]));
});
test("current review wins, but a stale review falls back to the submission", () => {
  const row = item(next);
  const review = event("remove", {
    id: "review",
    decisionTrack: "review",
    reviewedSubmissionId: "entity",
  });
  const other = item(next, sp2, [event("retain"), review]);
  assert.equal(check(row, [row, other]), undefined);
  other.state.decisions.push(
    event("retain", { id: "new-entity", createdAt: "2026-10-21T01:00:00Z" }),
  );
  assert.ok(check(row, [row, other]));
});
test("cancelled additions disappear; review-only additions count", () => {
  const row = item(next);
  assert.equal(
    check(row, [row, item(next, sp2, [event("cancel")], { isAdded: true })]),
    undefined,
  );
  assert.ok(
    check(row, [
      row,
      item(next, sp2, [event("add", { decisionTrack: "review" })], {
        isAdded: true,
      }),
    ]),
  );
});
test("row notices include duplicates between background and legislative sections", () => {
  const row = item(next);
  assert.equal(check(row, [row, item(next, null)]).locations[0].label, "Mandates and background");
  assert.equal(check(item(next, null), [row, item(next, null)]).locations[0].label, sp1);
});
test("whitespace aliases match; issuers and foreign entities stay distinct", () => {
  const row = item(next);
  assert.ok(check(row, [row, item(" A/RES/79/1 ", sp2)]));
  assert.equal(check(row, [row, item("S/RES/79/1", sp2)]), undefined);
  assert.equal(
    check(row, [row, { ...item(next, sp2), entity: "DESA" }]),
    undefined,
  );
});
test("filters do not hide duplicates from the warning calculation", () => {
  const source = mandate(next),
    addition = item(next, sp2, [event("add")], { isAdded: true }).state;
  const table = view.buildEntityTableView({
    entity: "OCHA",
    entityLong: null,
    legislativeMandates: { [sp1]: [source] },
    backgroundMandates: [],
    states: { [`${next}:${sp2}`]: addition },
    addedMetadata: {},
    updateTargetMetadata: {},
    counts: {},
    sort: { column: "symbol", direction: "asc" },
    sharedEntity: null,
    filters: { ...view.EMPTY_TABLE_FILTERS, notes: ["added"] },
  });
  assert.equal(table.visibleItems.length, 1);
  assert.equal(table.tableItems.length, 2);
  assert.equal(
    check(table.visibleItems[0], table.tableItems).locations[0].label,
    sp1,
  );
});

test("pending additions show the saved duplicate notice before the new row exists", () => {
  const index = locations.buildEntityCitationIndex([item(next, programme)], "OCHA");
  const warning = warnings.getPendingCitationWarning(next, sp1, index);
  assert.equal(warning.id, "duplicate-citation");
  assert.equal(warning.locations[0].label, "Programme level");
  assert.match(warning.advice, /single citation at programme level/);
  assert.equal(index.get(locations.citationSymbolKey(next)).length, 1,
    "preview must not change the effective citation index");
});

test("pending replacements report other originals and skip the edited citation itself", () => {
  const index = locations.buildEntityCitationIndex([
    item(old, sp1), item("A/RES/77/1", sp2, [event("update", { newSymbol: next })]),
  ], "OCHA");
  const warning = warnings.getPendingCitationWarning(" A/RES/79/1 ", sp1, index, old);
  assert.equal(warning.locations[0].label, sp2);
  assert.match(warning.locations[0].detail, /Via update of A\/RES\/77\/1/);
  assert.match(warning.advice, /moving this citation to programme level/);
  const alreadyUpdated = locations.buildEntityCitationIndex([
    item(old, sp1, [event("update", { newSymbol: next })]),
  ], "OCHA");
  assert.equal(warnings.getPendingCitationWarning(next, sp1, alreadyUpdated, old), null);
});

test("pending confirmation includes background and same-section citations but respects entity scope", () => {
  const index = locations.buildEntityCitationIndex([
    item(next, sp1, [event("remove")]),
    { ...item(next, sp2), entity: "DESA" },
  ], "OCHA");
  assert.equal(warnings.getPendingCitationWarning(next, sp2, index), null);
  const background = locations.buildEntityCitationIndex([item(next, null)], "OCHA");
  assert.equal(warnings.getPendingCitationWarning(next, sp2, background).locations[0].label, "Mandates and background");
  const legislative = locations.buildEntityCitationIndex([item(next, sp1)], "OCHA");
  assert.ok(warnings.getPendingCitationWarning(next, null, legislative));
  assert.ok(warnings.getPendingCitationWarning(next, sp1, legislative));
  assert.equal(warnings.getPendingCitationWarning("S/RES/79/1", sp2, legislative), null);
});

test("pending confirmation finds newly added symbols and replacements in the same section", () => {
  const additions = locations.buildEntityCitationIndex([
    item(next, sp1, [event("add")], { isAdded: true }),
  ], "OCHA");
  assert.match(warnings.getPendingCitationWarning(next, sp1, additions).locations[0].detail, /Added citation/);
  const replacements = locations.buildEntityCitationIndex([
    item(old, sp1, [event("update", { newSymbol: next })]),
  ], "OCHA");
  assert.match(warnings.getPendingCitationWarning(next, sp1, replacements).locations[0].detail, /Via update/);
});
