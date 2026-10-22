// Exercise sidebar request ordering and lifecycle without browser or database access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync("src/components/DocumentModal.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const activity = (id = "comment", reads = []) => ({
  success: true,
  data: {
    decisions: [{ id: `decision-${id}` }],
    comments: [{ id }],
    readCommentIds: reads,
  },
});
function harness() {
  const slots = [];
  const requests = [];
  const intervals = new Set();
  let cursor = 0;
  let effects = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        slots[index],
        (next) => {
          slots[index] = typeof next === "function" ? next(slots[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn) {
      return fn;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous.deps[i]))
      ) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const request =
    (kind) =>
    (...args) => {
      const pending = deferred();
      requests.push({ kind, args, ...pending });
      return pending.promise;
    };
  const dependencies = {
    "@/lib/polling": { REVIEW_POLL_INTERVAL_MS: 30_000 },
    react,
    "@/features/mandates/actions/decisions": {
      getDocumentDecisionsAction: request("activity"),
    },
    "@/features/mandates/services/documents/client-data-service": {
      fetchParagraphs: request("paragraphs"),
    },
    "@/features/mandates/services/documents/document-fetching": {
      getDocumentVersionsAction: request("versions"),
    },
  };
  const exports = {};
  new Function(
    "exports",
    "require",
    "document",
    "setInterval",
    "clearInterval",
    compiled,
  )(
    exports,
    (name) => dependencies[name] || {},
    { visibilityState: "visible" },
    (fn, intervalMs) => {
      assert.equal(intervalMs, 30_000);
      intervals.add(fn);
      return fn;
    },
    (fn) => intervals.delete(fn),
  );
  let props = {
    open: true,
    symbol: "A/RES/60/1",
    budgetVersion: "ppb2027",
    activeTab: "info",
  };
  return {
    requests,
    intervals,
    render(next = {}) {
      props = { ...props, ...next };
      cursor = 0;
      effects = [];
      const result = exports.useDocumentSidebarData(props);
      effects.forEach((effect) => effect());
      return result;
    },
  };
}

test("Info loads activity first and defers versions; paragraphs are never eagerly requested", async () => {
  const h = harness();
  assert.equal(h.render().activityLoading, true);
  assert.deepEqual(
    h.requests.map((r) => r.kind),
    ["activity"],
  );
  h.requests[0].resolve(activity());
  await settle();
  const state = h.render();
  assert.equal(state.activityLoading, false);
  assert.equal(state.allComments[0].id, "comment");
  assert.deepEqual(
    h.requests.map((r) => r.kind),
    ["activity", "versions"],
  );
  assert.equal(state.versionsLoading, true);
  h.render({ activeTab: "paragraphs" });
  assert.deepEqual(
    h.requests.map((r) => r.kind),
    ["activity", "versions", "paragraphs"],
  );
  // Slow optional requests leave the already loaded conversation available.
  assert.equal(h.render().allComments[0].id, "comment");
});

test("initial Paragraphs entry still schedules the conversation before fulltext", () => {
  const h = harness();
  h.render({ activeTab: "paragraphs" });
  assert.deepEqual(
    h.requests.map((r) => r.kind),
    ["activity", "paragraphs"],
  );
});

test("tab switches reuse a pending fulltext request, and errors do not discard comments", async () => {
  const h = harness();
  h.render();
  h.requests[0].resolve(activity());
  await settle();
  h.render({ activeTab: "paragraphs" });
  const fulltext = h.requests.find((r) => r.kind === "paragraphs");
  h.render({ activeTab: "info" });
  h.render({ activeTab: "paragraphs" });
  assert.equal(h.requests.filter((r) => r.kind === "paragraphs").length, 1);
  fulltext.reject(new Error("fulltext unavailable"));
  await settle();
  const state = h.render();
  assert.equal(state.paragraphsLoading, false);
  assert.equal(state.fulltextError, true);
  assert.equal(state.allComments[0].id, "comment");
});

test("late activity and fulltext responses cannot overwrite a newly selected document", async () => {
  const h = harness();
  h.render({ activeTab: "paragraphs" });
  const [oldActivity, oldParagraphs] = h.requests;
  h.render({ symbol: "A/RES/77/278" });
  const newActivity = h.requests.find(
    (r) => r.kind === "activity" && r !== oldActivity,
  );
  const newParagraphs = h.requests.find(
    (r) => r.kind === "paragraphs" && r !== oldParagraphs,
  );
  newActivity.resolve(activity("new"));
  newParagraphs.resolve([{ text: "new document" }]);
  await settle();
  h.render();
  oldActivity.resolve(activity("old"));
  oldParagraphs.resolve([{ text: "old document" }]);
  await settle();
  const state = h.render();
  assert.equal(state.allComments[0].id, "new");
  assert.equal(state.paragraphs[0].text, "new document");
});

test("changing cycle hides old activity until its own response and does not leak read receipts", async () => {
  const h = harness();
  h.render();
  h.requests[0].resolve(activity("active", ["active-read"]));
  await settle();
  h.render();
  const pending = h.render({ budgetVersion: "ppb2026" });
  assert.equal(pending.activityLoading, true);
  assert.deepEqual(pending.allComments, []);
  assert.equal(pending.readCommentIds, null);
  h.requests
    .find((r) => r.kind === "activity" && r.args[1] === "ppb2026")
    .resolve(activity("archive", ["archive-read"]));
  await settle();
  const state = h.render();
  assert.equal(state.allComments[0].id, "archive");
  assert.deepEqual(state.readCommentIds, ["archive-read"]);
});

test("failed initial activity remains loading, exposes the error and recovers on polling", async () => {
  const h = harness();
  h.render();
  h.requests[0].reject(new Error("database unavailable"));
  await settle();
  const failed = h.render();
  assert.equal(failed.activityLoading, true);
  assert.equal(failed.activityError, true);
  assert.deepEqual(
    h.requests.map((r) => r.kind),
    ["activity"],
  );
  for (const poll of h.intervals) void poll();
  h.requests[1].resolve(activity("recovered"));
  await settle();
  const recovered = h.render();
  assert.equal(recovered.activityError, false);
  assert.equal(recovered.activityLoading, false);
  assert.equal(recovered.allComments[0].id, "recovered");
});
