// Offline checks for canonical budget parts across current and historical source titles.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
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
const constants = load("src/lib/constants.ts");
const parts = load("src/features/mandates/services/budget-parts.ts", {
  "@/lib/constants": constants,
});
const versions = load("src/lib/db/budget-version.ts");
const data = load("src/features/mandates/services/data-service.ts", {
  "@/lib/db/db": {},
  "@/lib/db/budget-version": versions,
  "@/lib/constants": constants,
  "./budget-parts": parts,
  "./documents/metadata": {},
  "./documents/newer-versions": {},
});
function location(budgetPart, entity = "DESA", changes = {}) {
  return {
    origin_document: "PPB 2027",
    budget_part: budgetPart,
    entity,
    entity_long: entity,
    section: entity === "ECLAC" ? "21" : "9",
    section_title: "Source section title",
    part_in_document: "Legislative mandates",
    "sub-programme": "Subprogramme 1",
    component: null,
    ...changes,
  };
}
function record(symbol, citations) {
  return {
    full_document_symbol: symbol,
    description: "Citation title",
    year: 2020,
    body: "GA",
    type: "Resolution",
    link: "https://docs.un.org/en/" + symbol,
    metadata_from_db: true,
    citation_info: citations,
    num_entities: new Set(citations.map((row) => row.entity)).size,
    entities: citations.map((row) => row.entity),
  };
}
test("historical AND and official FOR titles resolve to the same IV/V metadata", () => {
  for (const [prefix, numeral, order] of [
    ["International", "IV", 4],
    ["Regional", "V", 5],
  ]) {
    const canonical = `${prefix} cooperation for development`;
    for (const title of [
      canonical,
      `${prefix} cooperation and development`,
      ` \t${prefix.toUpperCase()}  cooperation\u00a0for development\n`,
    ]) {
      const result = parts.resolveBudgetPart(title);
      assert.equal(result.key, canonical);
      assert.equal(result.meta.numeral, numeral);
      assert.equal(result.meta.order, order);
      assert.equal(result.meta.label, canonical);
    }
  }
  assert.equal(constants.BUDGET_PARTS_META.length, 14);
});
test("unknown parts remain unknown and ambiguous alias definitions are rejected", () => {
  for (const title of ["Unexpected source part", "__proto__", "constructor"]) {
    assert.deepEqual(parts.resolveBudgetPart(title), {
      key: title,
      meta: null,
    });
  }
  assert.deepEqual(parts.resolveBudgetPart(null), { key: "Other", meta: null });
  assert.throws(
    () =>
      parts.createBudgetPartResolver([
        { key: "A", numeral: "I", order: 1, label: "A", aliases: ["same"] },
        { key: "B", numeral: "II", order: 2, label: "B", aliases: ["SAME"] },
      ]),
    /Conflicting budget part alias/,
  );
});
test("full entity data groups aliases before deduplication, preserves source locations and sorts numerically", () => {
  const old = location("International cooperation and development", "DESA", {
    id: "legacy",
    origin_document: "PPB 2026",
  });
  const current = location(
    "International cooperation for development",
    "DESA",
    { id: "current" },
  );
  const result = data.transformPPBData(
    [
      record("A/RES/80/1", [old, current]),
      record("A/RES/80/2", [
        location("Regional cooperation and development", "ECLAC"),
      ]),
      record("A/RES/80/3", [location("International justice and law", "OLA")]),
      record("A/RES/80/4", [location("Unrecognized part", "OTHER")]),
    ],
    constants.BUDGET_PARTS_META,
  );
  assert.deepEqual(
    result.map((part) => part.order),
    [3, 4, 5, 999],
  );
  assert.deepEqual(
    result.map((part) => part.numeral),
    ["III", "IV", "V", ""],
  );
  const mandate =
    result[1].entities[0].legislativeMandates["Subprogramme 1"][0];
  assert.equal(
    result[1].entities[0].legislativeMandates["Subprogramme 1"].length,
    1,
  );
  assert.deepEqual(
    mandate.citationLocations.map((row) => row.id),
    ["legacy", "current"],
  );
  assert.equal(
    mandate.citationLocations[0].budget_part,
    "International cooperation and development",
  );
  assert.equal(
    mandate.citationLocations[1].budget_part,
    "International cooperation for development",
  );
  assert.equal(result[1].entities[0].section, "9");
  assert.equal(result[2].entities[0].section, "21");
});
test("overview and full data use identical canonical labels/order in both cycles; SQL canonicalizes before location distinct", async () => {
  const captured = [];
  const overview = load("src/features/mandates/services/overview.ts", {
    "next/cache": { unstable_cache: (fn) => fn },
    "@/lib/db/db": {
      query: async (sql, parameters, version) => {
        captured.push({ sql, parameters, version });
        const conjunction = version === "ppb2026" ? "and" : "for";
        return [
          {
            budget_part: `Regional cooperation ${conjunction} development`,
            entity: "ECLAC",
            entity_long: "ECLAC",
            section: "21",
            section_title: "Source section title",
            mandate_count: 243,
          },
          {
            budget_part: `International cooperation ${conjunction} development`,
            entity: "DESA",
            entity_long: "DESA",
            section: "9",
            section_title: "Source section title",
            mandate_count: 400,
          },
        ];
      },
    },
    "@/lib/db/budget-version": versions,
    "./budget-parts": parts,
  });
  const previous = await overview.fetchOverviewSummary("ppb2026");
  const current = await overview.fetchOverviewSummary("ppb2027");
  assert.deepEqual(previous, current);
  assert.deepEqual(
    current.map((part) => [part.part, part.numeral, part.order]),
    [
      ["International cooperation for development", "IV", 4],
      ["Regional cooperation for development", "V", 5],
    ],
  );
  for (const call of captured) {
    const mapping = JSON.parse(call.parameters[0]);
    assert.equal(
      mapping["international cooperation and development"],
      "International cooperation for development",
    );
    assert.equal(
      mapping["regional cooperation for development"],
      "Regional cooperation for development",
    );
    assert.ok(call.sql.indexOf("$1::jsonb") < call.sql.indexOf("locations AS"));
    assert.ok(call.sql.includes("'\\s+'"));
    assert.ok(call.sql.includes(`'${call.version}'`));
  }
});
