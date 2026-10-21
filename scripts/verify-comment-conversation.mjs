// Deterministic conversation/composer checks; no browser or database access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    assert.ok(
      Object.hasOwn(dependencies, name),
      `Unexpected dependency: ${name}`,
    );
    return dependencies[name];
  });
  return exports;
}
const service = load("src/features/mandates/services/comment-conversation.ts");
const decision = (id, time, track, entity = "OCHA", subprogramme = "3") => ({
  id,
  createdAt: `2026-10-20T12:00:0${time}Z`,
  decisionTrack: track,
  decision: "retain",
  entity,
  subprogramme,
});
const comment = (id, time, entity = "OCHA", subprogramme = "3") => ({
  id,
  createdAt: `2026-10-20T12:00:0${time}Z`,
  entity,
  subprogramme,
});

test("comments separate decision runs and each run retains both latest tracks", () => {
  const entries = service.conversationTimeline(
    [comment("c", 3)],
    [
      decision("a", 1, "entity"),
      decision("b", 2, "review"),
      decision("d", 4, "entity"),
      decision("e", 5, "review"),
      decision("f", 6, "entity"),
    ],
  );
  assert.deepEqual(
    entries.map((e) => e.type),
    ["decisions", "comment", "decisions"],
  );
  assert.deepEqual(
    entries[0].latest.map((d) => d.id),
    ["a", "b"],
  );
  assert.deepEqual(
    entries[2].latest.map((d) => d.id),
    ["e", "f"],
  );
  assert.equal(entries[2].decisions.length, 3);
});
test("legacy unspecified track and explicit entity track collapse together", () => {
  const [entry] = service.conversationTimeline(
    [],
    [decision("a", 1, undefined), decision("b", 2, "entity")],
  );
  assert.deepEqual(
    entry.latest.map((d) => d.id),
    ["b"],
  );
});
test("groups retain other-entity conversation and put exact current programme first", () => {
  const groups = service.conversationGroups({
    entity: "OCHA",
    subprogramme: "3",
    entitySubprogrammes: { OCHA: ["2", "3"] },
    comments: [comment("a", 1, "UNEP", "1")],
    decisions: [decision("b", 2, "review", "DMSPC", null)],
  });
  assert.equal(groups[0].key, service.conversationGroupKey("OCHA", "3"));
  assert.equal(groups.find((g) => g.entity === "UNEP").comments[0].id, "a");
  assert.equal(groups.find((g) => g.entity === "DMSPC").decisions[0].id, "b");
  assert.notEqual(
    service.conversationGroupKey("A:B", "C"),
    service.conversationGroupKey("A", "B:C"),
  );
});

function composerHarness(
  onComment,
  extraProps = {},
  markRead = async () => ({ success: true }),
) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useContext: () => null,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef: (value) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useEffect: (effect) => effects.push(effect),
  };
  const jsx = (type, props) => ({ type, props });
  const { CommentsDecisionPanel } = load(
    "src/components/CommentsDecisionPanel.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "lucide-react": new Proxy({}, { get: (_, name) => name }),
      "@/lib/theme": { DECISION_BADGE_STYLES: {} },
      "@/features/mandates/services/comment-conversation": service,
      "@/features/mandates/actions/comment-notifications": {
        markCommentsReadAction: markRead,
      },
      "@/hooks/useCommentNotifications": {
        dispatchCommentNotificationsRefresh() {},
      },
      "@/features/mandates/services/decision-tracks": {
        getDecisionTracks: () => ({}),
      },
      "./DecisionDropdown": {},
      "./ReviewDecisionControl": {},
    },
  );
  const render = () => {
    cursor = 0;
    effects = [];
    return CommentsDecisionPanel({
      symbol: "A/RES/80/111",
      entity: "OCHA",
      subprogramme: "3",
      comments: [],
      decisions: [],
      readCommentIds: [],
      budgetVersion: "ppb2027",
      readOnly: false,
      onComment,
      onDecisionSaved() {},
      onRead() {},
      ...extraProps,
    });
  };
  const find = (node, type) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === type) return node;
    return [node.props?.children]
      .flat(Infinity)
      .map((child) => find(child, type))
      .find(Boolean);
  };
  return {
    render,
    find,
    slots,
    get effects() {
      return effects;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test("failed posting preserves multiline draft for retry; success clears only after confirmation", async () => {
  let resolveSave;
  let calls = 0;
  const harness = composerHarness(() => {
    calls++;
    return new Promise((resolve) => {
      resolveSave = resolve;
    });
  });
  let tree = harness.render();
  harness
    .find(tree, "textarea")
    .props.onChange({ target: { value: "Question\nMore context" } });
  tree = harness.render();
  harness.find(tree, "form").props.onSubmit({ preventDefault() {} });
  tree = harness.render();
  assert.equal(
    harness.find(tree, "textarea").props.value,
    "Question\nMore context",
  );
  assert.equal(harness.find(tree, "textarea").props.disabled, true);
  resolveSave(null);
  await settle();
  tree = harness.render();
  assert.equal(
    harness.find(tree, "textarea").props.value,
    "Question\nMore context",
  );
  assert.equal(
    harness.find(harness.find(tree, "form"), "button").props.children,
    "Retry comment",
  );
  harness.find(tree, "form").props.onSubmit({ preventDefault() {} });
  resolveSave({ id: "saved" });
  await settle();
  assert.equal(harness.find(harness.render(), "textarea").props.value, "");
  assert.equal(calls, 2);
});
test("throwing saves preserve text and restore an enabled retry composer", async () => {
  const harness = composerHarness(async () => {
    throw new Error("offline");
  });
  harness
    .find(harness.render(), "textarea")
    .props.onChange({ target: { value: "Keep this draft" } });
  harness
    .find(harness.render(), "form")
    .props.onSubmit({ preventDefault() {} });
  await settle();
  const textarea = harness.find(harness.render(), "textarea");
  assert.equal(textarea.props.value, "Keep this draft");
  assert.equal(textarea.props.disabled, false);
});

test("read receipts include only displayed other-author messages, never collapsed groups or hidden browser pages", async () => {
  const savedDocument = globalThis.document;
  const savedObserver = globalThis.IntersectionObserver;
  const savedTimeout = globalThis.setTimeout;
  const savedClear = globalThis.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  let callback;
  const observed = [];
  const calls = [];
  const listeners = new Map();
  globalThis.document = {
    visibilityState: "visible",
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  globalThis.IntersectionObserver = class {
    constructor(handler) {
      callback = handler;
    }
    observe(element) {
      observed.push(element);
    }
    disconnect() {}
  };
  globalThis.setTimeout = (handler) => {
    timers.set(++timerId, handler);
    return timerId;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  try {
    const comments = [
      {
        ...comment("displayed", 1),
        userEmail: "other@un.org",
        comment: "Question",
      },
      {
        ...comment("own", 2),
        userEmail: "reader@un.org",
        comment: "Own message",
      },
      {
        ...comment("collapsed", 3, "UNEP", "1"),
        userEmail: "other@un.org",
        comment: "Other group",
      },
    ];
    const harness = composerHarness(
      undefined,
      { comments, userEmail: "reader@un.org" },
      async (ids, cycle) => {
        calls.push({ ids, cycle });
        return { success: true };
      },
    );
    const tree = harness.render();
    const collectArticles = (node) =>
      !node || typeof node !== "object"
        ? []
        : [
            ...(node.type === "article" ? [node] : []),
            ...[node.props?.children].flat(Infinity).flatMap(collectArticles),
          ];
    const elements = collectArticles(tree).map((node) => ({
      dataset: {
        commentId: node.props["data-comment-id"],
        author: node.props["data-author"],
      },
    }));
    assert.deepEqual(
      elements.map((e) => e.dataset.commentId),
      ["displayed", "own"],
    );
    harness.slots[4].current = { querySelectorAll: () => elements };
    const cleanup = harness.effects[2]();
    assert.deepEqual(
      observed.map((e) => e.dataset.commentId),
      ["displayed"],
    );
    callback([
      {
        target: elements[0],
        isIntersecting: false,
        intersectionRect: { height: 0 },
      },
    ]);
    assert.equal(timers.size, 0);
    globalThis.document.visibilityState = "hidden";
    callback([
      {
        target: elements[0],
        isIntersecting: true,
        intersectionRect: { height: 2 },
      },
    ]);
    assert.equal(timers.size, 0);
    globalThis.document.visibilityState = "visible";
    listeners.get("visibilitychange")();
    for (const timer of timers.values()) timer();
    await settle();
    assert.deepEqual(calls, [{ ids: ["displayed"], cycle: "ppb2027" }]);
    cleanup();
  } finally {
    globalThis.document = savedDocument;
    globalThis.IntersectionObserver = savedObserver;
    globalThis.setTimeout = savedTimeout;
    globalThis.clearTimeout = savedClear;
  }
});
