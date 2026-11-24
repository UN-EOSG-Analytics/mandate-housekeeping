// Automatic series suggestions must keep the issuing body and outcome type.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
    return dependencies[name];
  });
  return exports;
}
const root = "src/features/mandates/services/documents/";
const identity = load(root + "series-identity.ts");
const metadata = load(root + "metadata.ts", { "@/lib/db/db": {} });
function services(rows) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return rows;
  };
  const versions = load(root + "document-versions.ts", {
    "@/lib/db/db": { query },
    "./metadata": metadata,
    "./series-identity": identity,
  });
  const newer = load(root + "newer-versions.ts", {
    "./document-versions": versions,
    "./metadata": metadata,
  });
  return { ...versions, ...newer, calls };
}
const current = "A/RES/76/300";
function row(symbol, year = 2025, changes = {}) {
  return {
    currentSymbol: current,
    currentYear: 2022,
    symbol,
    year,
    title: "Environment :",
    body: "General Assembly",
    docType: "RES",
    ...changes,
  };
}
test("issuer identity separates the GA, HRC, ECOSOC and subsidiary bodies", () => {
  for (const [a, b] of [
    [current, "A/HRC/RES/52/23"],
    ["E/RES/2020/1", "E/CN.4/RES/2000/1"],
    ["E/CN.4/RES/2000/1", "E/CN.4/Sub.2/RES/2000/1"],
    ["DP/DEC/2020/1", "UNEP/GC/DEC/20/1"],
  ]) {
    assert.equal(
      identity.sameDocumentSeriesIdentity(a, b),
      false,
      `${a} / ${b}`,
    );
  }
  assert.equal(
    identity.sameDocumentSeriesIdentity("E/RES/2020/1", "A/RES/75/1"),
    false,
  );
  assert.equal(
    identity.sameDocumentSeriesIdentity("A/RES/75/1", "A/DEC/75/1"),
    false,
  );
});
test("historical sessions, letter parts and bounded commission aliases retain identity", () => {
  for (const [a, b] of [
    ["A/53/DEC/428", "A/DEC/79/1"],
    ["A/HRC/13/PRST/1", "A/HRC/PRST/30/1"],
    ["E/ECA/CM/11/RES/540(XX)", "E/ECA/CM/12/RES/1"],
    ["[E/CN.4/RES/I(II)]", "E/CN.4/RES/2000/1"],
    ["E/CEPAL/RES/100(VI)", "E/LC/RES/200(X)"],
    ["A/RES/31/22[B]", "A/RES/49/21[N]"],
  ]) {
    assert.equal(
      identity.sameDocumentSeriesIdentity(a, b),
      true,
      `${a} / ${b}`,
    );
  }
});
test("incomplete and composite symbols do not establish an issuer", () => {
  for (const symbol of [
    "A/75/1",
    "A/RES/",
    "DP/1982/1[DP/DEC/82/1]",
    "A/RES/1A/HRC/RES/2",
    "A/RES/1;A/RES/2",
    "A/RES/1[A/RES/2]",
  ]) {
    assert.equal(identity.documentSeriesIdentity(symbol), null, symbol);
  }
});
test("common candidate query filters issuer/type and deduplicates alias keys", async () => {
  const service = services([
    row(" A / RES / 79 / 1 "),
    row("A/RES/79/1"),
    row("A/HRC/RES/52/23"),
    row("E/RES/2025/1"),
    row("A/DEC/79/1"),
    row("A/RES/79/2", 2025, { docType: "DEC" }),
  ]);
  const candidates = await service.fetchSeriesCandidates([current], {
    newerOnly: true,
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.symbol),
    [" A / RES / 79 / 1 "],
  );
  const { sql, params } = service.calls[0];
  assert.deepEqual(params, [[current]]);
  assert.match(
    sql,
    /count\(DISTINCT \(series_key, un_body, doc_type, year\)\) = 1/,
  );
  assert.match(sql, /unambiguous_candidates/);
  assert.match(sql, /AND min\(year\) > 0/);
  assert.match(sql, /s\.year > c\.year/);
  assert.match(sql, /d\.deleted_at IS NULL/);
});
test("later candidates require known strictly earlier source year", async () => {
  const service = services([
    row("A/RES/79/1", 2022),
    row("A/RES/79/2", 2021),
    row("A/RES/79/3", 0),
    row("A/RES/79/4", 2025, { currentYear: 0 }),
    row("A/RES/79/5", 2025),
  ]);
  assert.deepEqual(
    (await service.fetchLaterVersions(current)).map(
      (candidate) => candidate.symbol,
    ),
    ["A/RES/79/5"],
  );
});
test("conflicting canonical target aliases cannot silently select a different year", async () => {
  const service = services([
    row("A/RES/79/1", 2024),
    row(" A/RES/79/1 ", 2025),
    row("A/RES/79/2", 2025),
  ]);
  assert.deepEqual(
    (await service.fetchLaterVersions(current)).map(
      (candidate) => candidate.symbol,
    ),
    ["A/RES/79/2"],
  );
});
test("unique latest candidate becomes a suggestion with all safe earlier choices", async () => {
  const service = services([
    row("A/RES/78/1", 2024),
    row("A/RES/79/1"),
    row(" A/RES/79/1 "),
  ]);
  const next = (await service.fetchNewerVersions([current])).get(current);
  assert.equal(next.symbol, "A/RES/79/1");
  assert.equal(next.title, "Environment");
  assert.deepEqual(next.allNewer, [
    { symbol: "A/RES/78/1", year: 2024 },
    { symbol: "A/RES/79/1", year: 2025 },
  ]);
});
test("suggestions and warning payloads preserve catalogue symbol spelling", async () => {
  const source = "S/RES/2733 (2024)",
    target = "S/RES/2780 (2025)";
  const service = services([
    row(target, 2025, { currentSymbol: source, currentYear: 2024 }),
    row("S/RES/2780(2025)", 2025, { currentSymbol: source, currentYear: 2024 }),
  ]);
  const candidate = (await service.fetchNewerVersions([source])).get(source);
  assert.equal(candidate.symbol, target);
  assert.deepEqual(candidate.allNewer, [{ symbol: target, year: 2025 }]);
  assert.equal(identity.safeNewerVersion(source, candidate).symbol, target);
  assert.deepEqual(
    identity.safeNewerVersion(source, candidate).allNewer,
    candidate.allNewer,
  );
});
test("tied latest year suppresses a single-target note but preserves the details list", async () => {
  const service = services([row("A/RES/79/271"), row("A/RES/80/107")]);
  assert.equal(
    (await service.fetchNewerVersions([current])).has(current),
    false,
  );
  assert.deepEqual(
    (await service.fetchLaterVersions(current)).map(
      (candidate) => candidate.symbol,
    ),
    ["A/RES/79/271", "A/RES/80/107"],
  );
});
test("client warning guard rejects mixed issuer targets and ambiguous aliases", () => {
  const candidate = {
    symbol: "A/RES/79/1",
    year: 2025,
    allNewer: [{ symbol: "A/RES/79/1", year: 2025 }],
  };
  assert.equal(
    identity.safeNewerVersion(current, candidate)?.symbol,
    candidate.symbol,
  );
  assert.equal(
    identity.safeNewerVersion(current, {
      ...candidate,
      symbol: "A/HRC/RES/52/23",
    }),
    undefined,
  );
  assert.equal(
    identity.safeNewerVersion(current, {
      ...candidate,
      allNewer: [...candidate.allNewer, { symbol: " A/RES/79/1 ", year: 2024 }],
    }),
    undefined,
  );
  assert.equal(
    identity.safeNewerVersion(current, {
      ...candidate,
      allNewer: [...candidate.allNewer, { symbol: "A/RES/80/1", year: 2025 }],
    }),
    undefined,
  );
});
test("empty request does not query the catalogue", async () => {
  const service = services([]);
  assert.deepEqual(await service.fetchSeriesCandidates([]), []);
  assert.equal(service.calls.length, 0);
});
