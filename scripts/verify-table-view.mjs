// Offline checks against the real grouping/filter pipeline; no DB or browser.
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
const tracks = load("src/features/mandates/services/decision-tracks.ts");
const age = load("src/features/mandates/services/age-indicator.ts");
const view = load("src/features/mandates/services/table-view.ts", {
  "./decision-tracks": tracks,
  "./age-indicator": age,
});
const filters = (changes) => ({ ...view.EMPTY_TABLE_FILTERS, ...changes });
function mandate(symbol, changes = {}) {
  return {
    symbol,
    title: symbol,
    body: "GA",
    docType: "Resolution",
    year: 2020,
    link: null,
    action: null,
    relevanceCount: 0,
    relevanceIndices: [],
    aiComments: {},
    otherEntitiesCount: 1,
    allEntities: ["OCHA", "DESA"],
    entitySubprogrammes: {},
    entityLongMap: {},
    allEntityRelevance: {},
    ...changes,
  };
}
function event(id, decision, changes = {}) {
  return {
    id,
    decision,
    documentSymbol: "A/RES/75/1",
    entity: "OCHA",
    subprogramme: "Subprogramme 2",
    decisionTrack: "entity",
    createdAt: `2026-01-0${id}T00:00:00Z`,
    newSymbol: null,
    manualMetadata: null,
    decisionReason: null,
    otherReason: null,
    ...changes,
  };
}
function state(events) {
  return {
    documentSymbol: events[0].documentSymbol,
    entity: "OCHA",
    subprogramme: "Subprogramme 2",
    decisions: events,
    comments: [],
  };
}
function build(changes = {}) {
  return view.buildEntityTableView({
    entity: "OCHA",
    legislativeMandates: {
      "Subprogramme 10": [mandate("A/RES/75/10")],
      "Subprogramme 2": [
        mandate("A/RES/75/1"),
        mandate("S/RES/2500", { body: "SC", year: 2010 }),
      ],
      "All Subprogrammes": [mandate("A/RES/75/2")],
    },
    backgroundMandates: [mandate("A/RES/60/1", { year: 2005 })],
    states: {},
    addedMetadata: {},
    updateTargetMetadata: {},
    entityLong: "Humanitarian Affairs",
    counts: {},
    filters: filters(),
    sort: { column: "symbol", direction: "asc" },
    sharedEntity: null,
    ...changes,
  });
}

test("filters combine across columns and apply to every section; programme order stays natural", () => {
  const result = build({
    filters: filters({ bodies: ["GA", "SC"], yearFrom: "2015" }),
  });
  assert.equal(result.visibleItems.length, 3);
  assert.deepEqual(
    result.sectionViews.map((s) => s.subprogramme),
    ["All Subprogrammes", "Subprogramme 2", "Subprogramme 10", null],
  );
  assert.equal(result.sectionViews[1].visibleMandates.length, 1);
  assert.equal(result.sectionViews[3].visibleMandates.length, 0);
  assert.equal(result.tableItems.length, 5);
});

test("searching either track's replacement preserves the original item and its section", () => {
  const submission = event("1", "update", { newSymbol: "A/RES/80/111" });
  const review = event("2", "update", {
    decisionTrack: "review",
    reviewedSubmissionId: "1",
    newSymbol: "A/RES/80/222",
  });
  const result = build({
    states: { "A/RES/75/1:Subprogramme 2": state([submission, review]) },
    filters: filters({ search: "80/222" }),
  });
  assert.equal(result.visibleItems.length, 1);
  assert.equal(result.visibleItems[0].mandate.symbol, "A/RES/75/1");
  assert.equal(result.visibleItems[0].subprogramme, "Subprogramme 2");
  assert.equal(result.visibleItems[0].replacements.length, 2);
});

test("a GA reviewer replacement remains visible beside differing submission and original bodies", () => {
  const submission = event("1", "update", { newSymbol: "764 (XXXIX)" });
  const review = event("2", "update", {
    decisionTrack: "review",
    reviewedSubmissionId: "1",
    newSymbol: "A/RES/80/157",
  });
  const result = build({
    legislativeMandates: {
      "Subprogramme 2": [mandate("A/RES/75/1", { body: "ECOSOC" })],
    },
    backgroundMandates: [],
    states: { "A/RES/75/1:Subprogramme 2": state([submission, review]) },
    updateTargetMetadata: {
      "764 (XXXIX)": {
        title: "Submission document",
        body: "ECLAC",
        year: 2022,
      },
      "A/RES/80/157": { title: "Reviewer document", body: "GA", year: 2025 },
    },
    filters: filters({ bodies: ["GA"] }),
  });
  assert.equal(result.visibleItems.length, 1);
  const item = result.visibleItems[0];
  assert.deepEqual(
    item.replacements.map((r) => r.source),
    ["submission", "review"],
  );
  assert.deepEqual(
    item.replacements.map(
      (r) => view.replacementTableMandate(item.mandate, r).body,
    ),
    ["ECLAC", "GA"],
  );
  assert.equal(item.mandate.body, "ECOSOC");
  assert.equal(view.REPLACEMENT_LABELS.review, "Reviewer replacement");
});

test("identical replacements combine and manual metadata stays consistent with Body filters", () => {
  const submission = event("1", "update", {
    newSymbol: "A/RES/80/157",
    manualMetadata: {
      title: "Manual title",
      body: "GA",
      year: 2025,
      link: "https://docs.un.org/en/A/RES/80/157",
    },
  });
  const review = event("2", "update", {
    decisionTrack: "review",
    reviewedSubmissionId: "1",
    newSymbol: submission.newSymbol,
  });
  const result = build({
    states: { "A/RES/75/1:Subprogramme 2": state([submission, review]) },
    updateTargetMetadata: {
      "A/RES/80/157": { title: "Cached title", body: "ECOSOC", year: 2024 },
    },
  });
  const item = result.tableItems.find(
    (item) => item.mandate.symbol === "A/RES/75/1",
  );
  assert.equal(item.replacements.length, 1);
  assert.equal(item.replacements[0].source, "both");
  const displayed = view.replacementTableMandate(
    item.mandate,
    item.replacements[0],
  );
  assert.equal(displayed.title, "Manual title");
  assert.equal(displayed.body, "GA");
  assert.equal(displayed.year, 2025);
  assert.equal(displayed.link, submission.manualMetadata.link);
  assert(!view.matchesTableItem(item, filters({ bodies: ["ECOSOC"] })));
});

test("outdated reviewer replacements stop affecting rows, search, Body filters and facets", () => {
  const submission = event("1", "retain");
  const review = event("2", "update", {
    decisionTrack: "review",
    reviewedSubmissionId: "1",
    newSymbol: "S/RES/9999",
    manualMetadata: { title: "Old proposal", body: "SC", year: 2025 },
  });
  const edited = event("3", "retain");
  const options = {
    legislativeMandates: { "Subprogramme 2": [mandate("A/RES/75/1")] },
    backgroundMandates: [],
    states: {
      "A/RES/75/1:Subprogramme 2": state([submission, review, edited]),
    },
  };
  const result = build(options);
  assert.equal(result.tableItems[0].replacements.length, 0);
  assert.equal(result.tableItems[0].tracks.reviewStale, true);
  assert.equal(result.tableItems[0].state.decisions.length, 3);
  assert(!result.facets.bodies.some((option) => option.value === "SC"));
  assert.equal(
    build({ ...options, filters: filters({ bodies: ["SC"] }) }).visibleItems
      .length,
    0,
  );
  assert.equal(
    build({ ...options, filters: filters({ search: "9999" }) }).visibleItems
      .length,
    0,
  );
  assert.equal(
    build({ ...options, filters: filters({ reviewStatus: ["outdated"] }) })
      .visibleItems.length,
    1,
  );
});

test("reviewer-only replacements are shown, while cleared reviews leave submission proposals intact", () => {
  const review = event("1", "update", {
    decisionTrack: "review",
    reviewedSubmissionId: null,
    newSymbol: "A/RES/80/157",
  });
  const reviewerOnly = view.getTableReplacements(
    tracks.getDecisionTracks([review]),
    {},
  );
  assert.equal(reviewerOnly.length, 1);
  assert.equal(reviewerOnly[0].source, "review");
  const submission = event("2", "update", { newSymbol: "A/RES/80/222" });
  const cleared = event("3", "cancel", {
    decisionTrack: "review",
    reviewedSubmissionId: "2",
  });
  const remaining = view.getTableReplacements(
    tracks.getDecisionTracks([submission, cleared]),
    {},
  );
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].source, "submission");
  assert.equal(remaining[0].symbol, submission.newSymbol);
});

test("decision filters remain independent and stale reviews are distinct from unreviewed rows", () => {
  const original = event("1", "remove");
  const review = event("2", "retain", {
    decisionTrack: "review",
    reviewedSubmissionId: "1",
  });
  const edited = event("3", "remove", { decisionReason: "other" });
  const states = {
    "A/RES/75/1:Subprogramme 2": state([original, review, edited]),
  };
  assert.equal(
    build({
      states,
      filters: filters({
        submissions: ["remove"],
        reviews: ["retain"],
        reviewStatus: ["outdated"],
      }),
    }).visibleItems.length,
    1,
  );
  assert.equal(
    build({
      states,
      filters: filters({ reviewStatus: ["reviewed"], submissions: ["remove"] }),
    }).visibleItems.length,
    0,
  );
});

test("shared counts and unread status match the same resolution in different subprogrammes", () => {
  const result = build({
    legislativeMandates: {
      One: [mandate("A/RES/75/1")],
      Two: [mandate("A/RES/75/1")],
    },
    backgroundMandates: [],
    counts: { "A/RES/75/1": { total: 4, unread: 2 } },
    filters: filters({ comments: ["unread"] }),
  });
  assert.equal(result.visibleItems.length, 2);
  assert.ok(
    result.visibleItems.every(
      (item) => item.totalComments === 4 && item.unreadComments === 2,
    ),
  );
});

test("added and reviewer-rejected citations participate in search, decisions, section counts and sorting", () => {
  const addition = event("1", "add", {
    documentSymbol: "A/RES/80/300",
    manualMetadata: { title: "New citation", year: 2025, body: "GA" },
  });
  const rejection = event("2", "remove", {
    documentSymbol: addition.documentSymbol,
    decisionTrack: "review",
    reviewedSubmissionId: "1",
  });
  const result = build({
    states: { "A/RES/80/300:Subprogramme 2": state([addition, rejection]) },
    filters: filters({ title: "new citation", reviews: ["remove"] }),
  });
  assert.equal(result.visibleItems.length, 1);
  assert.equal(result.visibleItems[0].mandate.isAdded, true);
  assert.equal(result.sectionViews[1].mandates.length, 3);
  assert.equal(
    build({
      states: { "A/RES/80/300:Subprogramme 2": state([addition, rejection]) },
      filters: filters({ search: "missing" }),
    }).visibleItems.length,
    0,
  );
});

test("facet counts omit their own filter while respecting other active filters", () => {
  const result = build({
    filters: filters({ bodies: ["GA"], yearFrom: "2009" }),
  });
  assert.equal(result.facets.bodies.find((o) => o.value === "SC").count, 1);
  assert.equal(result.facets.bodies.find((o) => o.value === "GA").count, 3);
});

test("missing years sort last in both directions and shared-citation filter combines with search", () => {
  const items = [2020, null, 2010].map((year, i) => ({
    mandate: mandate(`A/RES/75/${i}`, { year }),
  }));
  for (const direction of ["asc", "desc"])
    assert.equal(
      view.sortTableItems(items, { column: "year", direction }).at(-1).mandate
        .year,
      null,
    );
  assert.equal(
    build({ sharedEntity: "DESA", filters: filters({ search: "2500" }) })
      .visibleItems.length,
    1,
  );
  assert.equal(build({ sharedEntity: "UNEP" }).visibleItems.length, 0);
  assert.equal(view.hasTableFilters(filters()), false);
  assert.equal(view.hasTableFilters(filters({ comments: ["unread"] })), true);
  assert.notEqual(view.sectionAnchor("a/b"), view.sectionAnchor("a b"));
});

test("Others exposes actual other entities, excludes the current entity, and supports combined entity choices", () => {
  const unfiltered = build();
  assert.deepEqual(
    unfiltered.facets.others.map((option) => option.value),
    ["DESA"],
  );
  assert.equal(unfiltered.facets.others[0].count, 5);
  assert.equal(
    build({ filters: filters({ others: ["DESA", "UNEP"] }) }).visibleItems
      .length,
    5,
  );
  assert.equal(
    build({ filters: filters({ others: ["OCHA"] }) }).visibleItems.length,
    0,
  );
  assert.equal(
    build({ filters: filters({ others: ["DESA"], bodies: ["SC"] }) })
      .visibleItems.length,
    1,
  );
});
