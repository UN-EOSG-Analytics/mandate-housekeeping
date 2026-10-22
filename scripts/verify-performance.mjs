// Focused lifecycle checks without database writes or browser dependencies.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as React from "react";

function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("exports", "require", ...Object.keys(globals), code)(
    exports,
    (name) => {
      if (name === "react/jsx-runtime")
        return { jsx: React.createElement, jsxs: React.createElement };
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...Object.values(globals),
  );
  return exports;
}
function hooks() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    ...React,
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
    useContext: () => null,
    useCallback: (fn) => fn,
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
  return {
    react,
    render(fn) {
      cursor = 0;
      effects = [];
      const result = fn();
      effects.forEach((fn) => fn());
      return result;
    },
  };
}
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
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function find(node, predicate) {
  if (Array.isArray(node))
    return node.map((child) => find(child, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return;
  return predicate(node) ? node : find(node.props.children, predicate);
}
function reviewHarness() {
  const h = hooks();
  const calls = [];
  function Placeholder() {}
  function DecisionDropdown() {}
  const actions = Object.fromEntries(
    ["createDecisionAction", "updateDecisionReasonAction"].map((name) => [
      name,
      (...args) => {
        const request = deferred();
        calls.push({ name, args, ...request });
        return request.promise;
      },
    ]),
  );
  const tracks = load("src/features/mandates/services/decision-tracks.ts", {});
  const { ReviewDecisionControl } = load(
    "src/components/ReviewDecisionControl.tsx",
    {
      react: h.react,
      "lucide-react": {
        Copy: Placeholder,
        MoreHorizontal: Placeholder,
        AlertCircle: Placeholder,
        Loader2: Placeholder,
      },
      "./ui/popover": {
        Popover: Placeholder,
        PopoverContent: Placeholder,
        PopoverTrigger: Placeholder,
      },
      "./ui/dialog": {
        Dialog: Placeholder,
        DialogContent: Placeholder,
        DialogHeader: Placeholder,
        DialogTitle: Placeholder,
      },
      "@/features/mandates/actions/decisions": actions,
      "@/features/mandates/services/decision-tracks": tracks,
      "@/lib/db/budget-version": { CURRENT_BUDGET_VERSION: "ppb2027" },
      "@/features/mandates/ui/ManualDocumentForm": {
        ManualDocumentForm: Placeholder,
      },
      "@/features/mandates/ui/DocumentSearchInput": {
        DocumentSearchInput: Placeholder,
      },
      "./DecisionDropdown": { DecisionDropdown },
    },
  );
  let props = {
    entity: "OCHA",
    symbol: "A/RES/80/1",
    subprogramme: null,
    submission: {
      id: "submission",
      decision: "retain",
      createdAt: "2026-10-20T00:00:00Z",
    },
    review: null,
    editable: true,
    onSaved: (event) => persisted.push(event),
  };
  const persisted = [];
  const render = (next = {}) => {
    props = { ...props, ...next };
    return h.render(() => ReviewDecisionControl(props));
  };
  return {
    render,
    calls,
    persisted,
    dropdown: (tree) => find(tree, (node) => node.type === DecisionDropdown),
  };
}
const event = (decision = "remove") => ({
  id: "saved",
  decision,
  createdAt: "2026-10-21T12:00:00Z",
  decisionTrack: "review",
  reviewedSubmissionId: "submission",
  decisionReason: null,
  otherReason: null,
});

test("review preview is immediate, failure rolls back, and duplicate writes are blocked", async () => {
  const h = reviewHarness();
  const save = h.dropdown(h.render()).props.onChange("remove");
  assert.equal(h.dropdown(h.render()).props.decision, "remove");
  assert.equal(
    h.persisted.length,
    0,
    "Pending changes must not enter persisted history",
  );
  await h.dropdown(h.render()).props.onChange("retain");
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ success: false, error: "Submission changed" });
  await save;
  assert.equal(h.dropdown(h.render()).props.decision, null);
  assert.ok(find(h.render(), (node) => node.props.role === "alert"));
});
test("copy previews submission and a saved reason stays visible until parent catches up", async () => {
  const h = reviewHarness();
  const copy = find(
    h.render(),
    (node) => node.props["aria-label"] === "Copy submission decision",
  );
  const save = copy.props.onClick();
  assert.equal(h.dropdown(h.render()).props.decision, "retain");
  assert.equal(h.calls[0].args[0].agreeWithSubmission, true);
  h.calls[0].resolve({ success: true, data: event("retain") });
  await save;
  const reason = h
    .dropdown(h.render())
    .props.onReasonChange("other", "Explanation");
  assert.equal(h.dropdown(h.render()).props.reason, "other");
  h.calls[1].resolve({
    success: true,
    data: {
      ...event("retain"),
      id: "reason",
      decisionReason: "other",
      otherReason: "Explanation",
      createdAt: "2026-10-21T12:01:00Z",
    },
  });
  await reason;
  assert.equal(h.dropdown(h.render()).props.otherReason, "Explanation");
  assert.equal(h.persisted.length, 2);
  const newer = {
    ...event("update"),
    id: "remote",
    createdAt: "2026-10-21T12:02:00Z",
  };
  assert.equal(
    h.dropdown(h.render({ review: newer })).props.decision,
    "update",
  );
});
test("failed reason restores the previous confirmed reason", async () => {
  const h = reviewHarness();
  const reason = h
    .dropdown(h.render({ review: event() }))
    .props.onReasonChange("other", "Draft");
  assert.equal(h.dropdown(h.render()).props.reason, "other");
  h.calls[0].reject(new Error("offline"));
  await reason;
  assert.equal(h.dropdown(h.render()).props.reason, null);
  assert.equal(h.persisted.length, 0);
});

function pollingHarness() {
  const h = hooks();
  const requests = [];
  const timers = new Map();
  const listeners = new Set();
  const document = {
    visibilityState: "visible",
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const { useRealtimeDecisions } = load(
    "src/hooks/useRealtimeDecisions.ts",
    {
      react: h.react,
      "@/lib/polling": load("src/lib/polling.ts", {}),
      "@/features/mandates/actions/realtime": {
        getRealtimeChangesAction: (...args) => {
          const request = deferred();
          requests.push({ ...request, args });
          return request.promise;
        },
      },
    },
    {
      document,
      setTimeout: (fn, ms) => {
        timers.set(fn, ms);
        return fn;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  );
  let props = { entity: "OCHA" };
  return {
    requests,
    timers,
    render(next = {}) {
      props = { ...props, ...next };
      return h.render(() => useRealtimeDecisions(props));
    },
    visible(value) {
      document.visibilityState = value;
      listeners.forEach((fn) => fn());
    },
    tick() {
      const first = timers.keys().next().value;
      assert.ok(first, "Expected a scheduled poll");
      timers.delete(first);
      first();
    },
  };
}
const response = (changes = []) => ({
  success: true,
  data: {
    changes,
    serverTime: "2026-10-21T12:00:00Z",
    hasChanges: !!changes.length,
    reviewMode: {
      isUnderReview: false,
      reviewSessionId: null,
      reviewStartedBy: null,
    },
  },
});
test("polling pauses hidden tabs, prevents overlap and resumes immediately", async () => {
  const h = pollingHarness();
  const state = h.render();
  assert.equal(h.requests.length, 1);
  state.refresh();
  assert.equal(h.requests.length, 1);
  h.visible("hidden");
  h.requests[0].resolve(response());
  await settle();
  assert.equal(h.timers.size, 0);
  state.refresh();
  assert.equal(h.requests.length, 1);
  h.visible("visible");
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response());
  await settle();
  assert.deepEqual([...h.timers.values()], [30_000]);
});
test("polling backs off and retries a failed batch without advancing the cursor", async () => {
  const h = pollingHarness();
  let batchCalls = 0;
  const batch = deferred();
  h.render({
    onRemoteChanges: () => {
      batchCalls++;
      return batch.promise;
    },
  });
  const changes = [
    { id: "a", document_symbol: "A/RES/80/1" },
    { id: "b", document_symbol: "A/RES/80/2" },
  ];
  h.requests[0].resolve(response(changes));
  await settle();
  assert.equal(batchCalls, 1);
  assert.equal(h.timers.size, 0);
  batch.reject(new Error("refresh failed"));
  await settle();
  assert.deepEqual([...h.timers.values()], [60_000]);
  h.render({
    onRemoteChanges: () => {
      batchCalls++;
    },
  });
  h.tick();
  assert.equal(h.requests[1].args[1], undefined);
  h.requests[1].resolve(response(changes));
  await settle();
  assert.equal(batchCalls, 2);
  assert.deepEqual([...h.timers.values()], [30_000]);
  h.tick();
  h.requests[2].resolve(response(changes));
  await settle();
  assert.equal(batchCalls, 2);
});
test("disabling polling ignores late responses and prevents further scheduling", async () => {
  const h = pollingHarness();
  let updates = 0;
  h.render({ onRemoteChanges: () => updates++ });
  h.render({ enabled: false });
  h.requests[0].resolve(response([{ id: "old" }]));
  await settle();
  assert.equal(updates, 0);
  assert.equal(h.timers.size, 0);
});

test("overview only fetches summaries with explicit cycle scoping and cycle cache keys", async () => {
  const calls = [];
  let cacheOptions;
  const { fetchOverviewSummary } = load(
    "src/features/mandates/services/overview.ts",
    {
      "next/cache": {
        unstable_cache: (fn, keys, options) => {
          cacheOptions = options;
          return fn;
        },
      },
      "@/lib/db/db": {
        query: async (...args) => {
          calls.push(args);
          return [
            {
              budget_part: "Political affairs",
              entity: "OCHA",
              entity_long: "Office",
              section: "27",
              section_title: "Assistance",
              mandate_count: 4,
            },
          ];
        },
      },
      "@/lib/db/budget-version": {
        versionPredicateSqlFor: (_, version) => `cycle = '${version}'`,
      },
      "@/lib/constants": {
        BUDGET_PARTS_META: [
          {
            key: "Political affairs",
            label: "Political affairs",
            numeral: "II",
            order: 2,
          },
        ],
      },
    },
  );
  const parts = await fetchOverviewSummary("ppb2027");
  await fetchOverviewSummary("ppb2026");
  assert.equal(parts[0].entities[0].mandateCount, 4);
  assert.equal("backgroundMandates" in parts[0].entities[0], false);
  assert.match(calls[0][0], /cycle = 'ppb2027'/);
  assert.equal(calls[0][2], "ppb2027");
  assert.equal(calls[1][2], "ppb2026");
  assert.doesNotMatch(calls[0][0], /unified_documents|resolution_series/);
  assert.equal(cacheOptions.revalidate, 60);
});

test("realtime reads share auth transaction, database watermark, overlap and no row cutoff", async () => {
  const statements = [];
  let transactions = 0;
  const tx = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes("clock_timestamp"))
      return [{ server_time: "2026-10-21 12:00:00+00" }];
    return [];
  };
  const { getRealtimeChangesAction } = load(
    "src/features/mandates/actions/realtime.ts",
    {
      "@/features/auth/auth": {
        getCurrentUser: async (runQuery) => {
          assert.equal(runQuery, tx);
          return { email: "reviewer@un.org" };
        },
      },
      "@/lib/db/db": {
        transaction: async (fn) => {
          transactions++;
          return fn(tx);
        },
      },
    },
  );
  assert.equal(
    (await getRealtimeChangesAction("OCHA", "invalid")).success,
    false,
  );
  assert.equal(transactions, 0);
  const result = await getRealtimeChangesAction("OCHA", "2026-10-21T11:59:00Z");
  assert.equal(result.success, true);
  assert.equal(transactions, 1);
  assert.match(statements[1].sql, /interval '30 seconds'/);
  assert.doesNotMatch(statements[1].sql, /LIMIT 50/);
  assert.equal(statements[1].params[2], result.data.serverTime);
});

test("changed documents load in one scoped batch and resolve both decision tracks", async () => {
  const statements = [];
  let transactions = 0;
  const rows = [
    {
      id: "submission",
      document_symbol: "A/RES/80/1",
      entity: "OCHA",
      subprogramme: null,
      decision: "retain",
      decision_track: "entity",
      created_at: "2026-10-21T10:00:00Z",
    },
    {
      id: "review",
      document_symbol: "A/RES/80/1",
      entity: "OCHA",
      subprogramme: null,
      decision: "remove",
      decision_track: "review",
      reviewed_submission_id: "submission",
      created_at: "2026-10-21T10:01:00Z",
    },
    {
      id: "other-programme",
      document_symbol: "A/RES/80/2",
      entity: "OCHA",
      subprogramme: "Programme 2",
      decision: "retain",
      decision_track: "entity",
      created_at: "2026-10-21T10:02:00Z",
    },
  ];
  const tx = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes("FROM mandates_housekeeping.mandate_decisions"))
      return rows;
    if (sql.includes("COUNT(*)"))
      return [{ document_symbol: "A/RES/80/1", count: "7" }];
    return [];
  };
  const { getEntityDecisionsAction } = load(
    "src/features/mandates/actions/decisions.ts",
    {
      "../services/comment-notifications": {},
      "@/lib/db/review-cycle": {},
      "@/features/auth/auth": {},
      "@/lib/db/review-lock": {},
      "../services/decision-tracks": load(
        "src/features/mandates/services/decision-tracks.ts",
        {},
      ),
      "@/lib/db/db": {
        transaction: async (fn) => {
          transactions++;
          return fn(tx);
        },
        query: () => assert.fail("Use the batch transaction"),
      },
    },
  );
  const symbols = ["A/RES/80/1", "A/RES/80/2"];
  const result = await getEntityDecisionsAction("OCHA", symbols);
  assert.equal(transactions, 1);
  assert.equal(statements.length, 3);
  assert.deepEqual(statements[0].params, ["OCHA", symbols]);
  assert.deepEqual(statements[2].params, [symbols]);
  assert.equal(result.data.states.length, 2);
  assert.equal(result.data.states[0].decision.id, "submission");
  assert.equal(result.data.states[0].reviewDecision.id, "review");
  assert.equal(result.data.states[0].reviewStale, false);
  assert.equal(result.data.totalComments["A/RES/80/1"], 7);
});
