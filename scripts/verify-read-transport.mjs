// Auth/cycle boundaries, independent HTTP lifetimes, search branching and deltas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("exports", "require", ...Object.keys(globals), code)(
    exports,
    (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...Object.values(globals),
  );
  return exports;
}
function routeHarness({ session = true, user = true } = {}) {
  const calls = [];
  const action =
    (name, data = { success: true, data: [] }) =>
    async (...args) => {
      calls.push({ name, args });
      return data;
    };
  const route = load("src/app/api/review/[resource]/route.ts", {
    "next/server": {
      NextResponse: { json: (data, options) => ({ data, ...options }) },
    },
    "@/features/auth/auth": {
      getSession: async () => session,
      getCurrentUser: async () => user,
    },
    "@/lib/db/review-cycle": { getBudgetVersion: async () => "ppb2027" },
    "@/features/mandates/actions/realtime": {
      getRealtimeChangesAction: action("realtime"),
    },
    "@/features/mandates/actions/decisions": {
      getDocumentDecisionsAction: action("activity"),
      getEntityDecisionsAction: action("states"),
    },
    "@/features/mandates/actions/comment-notifications": {
      getCommentNotificationsAction: action("notifications"),
    },
    "@/features/mandates/services/documents/document-fetching": {
      searchDocumentsAction: action("search", []),
      getDocumentVersionsAction: action("versions"),
      getDocumentMetadataAction: action("metadata"),
    },
    "@/features/mandates/actions/fulltext": {
      fetchFulltextAction: action("paragraphs", []),
    },
    "@/features/mandates/actions/review-mode": {
      getReviewModeStatusAction: action("review-status"),
    },
    "@/features/mandates/actions/review-baselines": {
      getEntityReviewChangesAction: action("review-changes"),
    },
    "@/features/auth/user": { getUserRoleAction: action("user") },
    "@/features/mandates/services/reference-data": {
      getIssuingBodies: action("issuing-bodies", []),
    },
  });
  return {
    calls,
    get: (resource, query = "") =>
      route.GET(
        { nextUrl: new URL(`https://example.test/?${query}`) },
        { params: Promise.resolve({ resource }) },
      ),
  };
}
test("read endpoints require a session and live account for catalogue reads", async () => {
  const anonymous = routeHarness({ session: false });
  assert.equal((await anonymous.get("search", "q=test")).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const deleted = routeHarness({ user: false });
  assert.equal((await deleted.get("search", "q=test")).status, 401);
  assert.equal(deleted.calls.length, 0);
});
test("stale cycles are rejected before reading and responses cannot be shared by caches", async () => {
  const h = routeHarness();
  assert.equal(
    (await h.get("activity", "version=ppb2026&symbol=A%2FRES%2F80%2F1")).status,
    409,
  );
  assert.equal(h.calls.length, 0);
  const response = await h.get(
    "activity",
    "version=ppb2027&symbol=A%2FRES%2F80%2F1&since=2026-10-22T12:00:00Z&viewer=reader%40un.org",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.headers.Vary, "Cookie");
  assert.deepEqual(h.calls[0].args, [
    "A/RES/80/1",
    "ppb2027",
    "2026-10-22T12:00:00Z",
    "reader@un.org",
  ]);
});
test("invalid inputs and unknown resources never reach query handlers", async () => {
  const h = routeHarness();
  assert.equal((await h.get("search", `q=${"x".repeat(301)}`)).status, 400);
  assert.equal((await h.get("states", "entity=OCHA&symbols=")).status, 400);
  assert.equal(
    (await h.get("review-changes", "entity=OCHA&session=bad")).status,
    400,
  );
  assert.equal((await h.get("unknown")).status, 404);
  assert.equal(h.calls.length, 0);
});
test("independent reads start concurrently and propagate abort signals without action imports", async () => {
  const requests = [];
  const client = load(
    "src/features/mandates/services/client-reads.ts",
    {},
    {
      fetch: (url, options) =>
        new Promise((resolve) => requests.push({ url, options, resolve })),
    },
  );
  const controller = new AbortController();
  const search = client.searchDocumentsAction("A/RES/80/1", controller.signal);
  const poll = client.getRealtimeChangesAction("OCHA", undefined, "ppb2027");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.signal, controller.signal);
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[0].options.credentials, "same-origin");
  requests[1].resolve({
    ok: true,
    json: async () => ({ success: true, data: { changes: [] } }),
  });
  await poll;
  requests[0].resolve({ ok: true, json: async () => [] });
  assert.deepEqual(await search, []);
});
test("large state refreshes bound URL size and preserve totals across batches", async () => {
  const urls = [];
  const client = load(
    "src/features/mandates/services/client-reads.ts",
    {},
    {
      fetch: async (url) => {
        urls.push(url);
        const symbols = new URL(
          url,
          "https://example.test",
        ).searchParams.getAll("symbols");
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              states: symbols.map((documentSymbol) => ({ documentSymbol })),
              totalComments: Object.fromEntries(
                symbols.map((symbol) => [symbol, 2]),
              ),
            },
          }),
        };
      },
    },
  );
  const symbols = Array.from({ length: 205 }, (_, i) => `A/RES/80/${i}`);
  const result = await client.getEntityDecisionsAction(
    "OCHA",
    symbols,
    "ppb2027",
  );
  assert.equal(urls.length, 3);
  assert.equal(result.data.states.length, 205);
  assert.equal(Object.keys(result.data.totalComments).length, 205);
});

function searchHarness(prefixRows) {
  const calls = [];
  const sql = load("src/features/mandates/services/documents/search-sql.ts");
  const { searchDocuments } = load(
    "src/features/mandates/services/documents/search.ts",
    {
      "next/cache": { unstable_cache: (fn) => fn },
      "@/lib/db/db": {
        transaction: async (fn, version) => {
          assert.equal(version, "ppb2027");
          return fn(async (query, params) => {
            calls.push({ query, params });
            return calls.length === 1
              ? prefixRows
              : [
                  {
                    symbol: "E/RES/2025/1",
                    title: "Title match :",
                    year: 2025,
                  },
                ];
          });
        },
      },
      "@/lib/db/review-cycle": { getBudgetVersion: async () => "ppb2027" },
      "./metadata": {
        cleanTitle: (text) => text?.replace(/\s*:\s*$/, "").trim() ?? null,
        normalizeSymbol: (text) => text.replace(/\s/g, "").toUpperCase(),
      },
      "./search-sql": sql,
    },
  );
  return { searchDocuments, calls };
}
test("symbol results skip title scanning when full and title fallback fills only remaining slots", async () => {
  const full = searchHarness(
    Array.from({ length: 20 }, (_, i) => ({
      symbol: `A/RES/80/${i}`,
      title: "Title",
    })),
  );
  assert.equal((await full.searchDocuments("A/RES/80")).length, 20);
  assert.equal(full.calls.length, 1);
  const partial = searchHarness([{ symbol: "A/RES/80/1", title: "Exact" }]);
  const results = await partial.searchDocuments("A / RES / 80/1");
  assert.equal(results[0].symbol, "A/RES/80/1");
  assert.equal(partial.calls[0].params[0], "A/RES/80/1%");
  assert.equal(partial.calls[1].params[2], 19);
  assert.equal(results[1].title, "Title match");
});
test("search treats LIKE wildcards literally and rejects oversized/empty terms", async () => {
  const h = searchHarness([]);
  assert.deepEqual(await h.searchDocuments("x"), []);
  assert.deepEqual(await h.searchDocuments("x".repeat(301)), []);
  assert.equal(h.calls.length, 0);
  await h.searchDocuments("test_%");
  assert.equal(h.calls[0].params[0], "TEST\\_\\%%");
  assert.equal(h.calls[1].params[0], "%test\\_\\%%");
});

test("activity deltas include resolved and unresolved comments and verify the viewer", async () => {
  const calls = [];
  const tx = async (query, params) => {
    calls.push({ query, params });
    return query.includes("clock_timestamp()::text")
      ? [{ server_time: "2026-10-22 12:00:00+00" }]
      : [];
  };
  const { getDocumentDecisionsAction } = load(
    "src/features/mandates/actions/decisions.ts",
    {
      "../services/comment-notifications": {
        getCommentReadState: async () => [],
      },
      "@/lib/db/review-cycle": { getBudgetVersion: async () => "ppb2027" },
      "@/features/auth/auth": {
        getCurrentUser: async (query) => {
          assert.equal(query, tx);
          return { email: "reader@un.org" };
        },
      },
      "@/features/auth/permissions": {},
      "@/lib/db/review-lock": {},
      "../services/decision-tracks": {},
      "@/lib/db/db": { transaction: (fn) => fn(tx) },
    },
  );
  assert.equal(
    (
      await getDocumentDecisionsAction(
        "A/RES/80/1",
        "ppb2027",
        undefined,
        "other@un.org",
      )
    ).success,
    false,
  );
  assert.equal(calls.length, 0);
  const result = await getDocumentDecisionsAction(
    "A/RES/80/1",
    "ppb2027",
    "2026-10-22T11:59:00Z",
    "reader@un.org",
  );
  assert.equal(result.data.serverTime, "2026-10-22 12:00:00+00");
  assert.match(
    calls[2].query,
    /GREATEST\(c.created_at, c.updated_at, c.resolved_at\)/,
  );
  assert.deepEqual(calls[1].params, ["A/RES/80/1", "2026-10-22T11:59:00.000Z"]);
});
