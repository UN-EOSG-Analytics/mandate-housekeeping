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
  renderHistory = false,
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
  const jsx = (type, props) =>
    renderHistory && typeof type === "function" ? type(props) : { type, props };
  const icons = new Proxy({}, { get: (_, name) => name });
  const utils = { cn: (...classes) => classes.filter(Boolean).join(" ") };
  const theme = load("src/lib/theme.ts");
  const reasons = load("src/features/mandates/ui/ReasonsModal.tsx", {
    react,
    "@/components/ui/dialog": {
      Dialog: "dialog-root",
      DialogContent: "dialog-content",
      DialogTitle: "dialog-title",
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": icons,
    "@/features/mandates/services/decision-reasons": load(
      "src/features/mandates/services/decision-reasons.ts",
    ),
    "@un-eosg/ui/typography": { typography: {} },
    "@/lib/utils": utils,
    "@/lib/theme": theme,
  });
  const { CommentsDecisionPanel } = load(
    "src/components/CommentsDecisionPanel.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "lucide-react": icons,
      "@/lib/theme": theme,
      "@/lib/utils": utils,
      "@un-eosg/ui/typography": { typography: { eyebrow: "" } },
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
      "./ui/popover": {},
      "@/features/mandates/ui/ReasonsModal": reasons,
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

test("composer stays within its current group and retains a draft across collapse", () => {
  const harness = composerHarness(async () => null);
  let tree = harness.render();
  const group = harness.find(tree, "section");
  assert.ok(harness.find(group, "form"));
  harness
    .find(group, "textarea")
    .props.onChange({ target: { value: "Keep this draft" } });
  harness.find(group, "button").props.onClick();
  tree = harness.render();
  assert.equal(harness.find(tree, "form"), undefined);
  harness.find(harness.find(tree, "section"), "button").props.onClick();
  assert.equal(
    harness.find(harness.render(), "textarea").props.value,
    "Keep this draft",
  );
});

test("the timeline includes persisted local decisions before polling, without duplicate history", () => {
  const earlier = decision("earlier", 1, "entity");
  const latest = decision("latest", 2, "entity");
  const harness = composerHarness(undefined, {
    decisions: [earlier],
    state: { decisions: [earlier, latest], decision: latest },
  });
  function collect(node) {
    if (!node || typeof node !== "object") return [];
    return [
      ...(node.type?.name === "DecisionLine" ? [node.props.decision.id] : []),
      ...[node.props?.children].flat(Infinity).flatMap(collect),
    ];
  }
  assert.deepEqual(collect(harness.render()).sort(), ["earlier", "latest"]);
});

test("history counts exclude the visible update and expanded changes remain chronological", () => {
  const walk = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
  const text = (node) =>
    Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object"
        ? text(node.props?.children)
        : node == null || typeof node === "boolean"
          ? ""
          : String(node);
  for (const count of [1, 2, 3]) {
    const decisions = Array.from({ length: count }, (_, index) =>
      decision(`change-${index}`, index + 1, index % 2 ? "review" : "entity"),
    );
    const nodes = walk(composerHarness(undefined, { decisions }).render());
    const history = nodes.find((node) => node.type === "details");
    const lines = nodes.filter((node) => node.type?.name === "DecisionLine");
    assert.deepEqual(
      lines.map((node) => node.props.decision.id),
      decisions.map((event) => event.id),
    );
    const run = nodes.find(
      (node) =>
        node.type === "div" &&
        [node.props.children]
          .flat(Infinity)
          .some((child) => child?.type?.name === "DecisionLine"),
    );
    const direct = [run.props.children]
      .flat(Infinity)
      .filter((child) => child && typeof child === "object");
    assert.equal(direct.at(-1).props.decision.id, decisions.at(-1).id);
    if (count === 1) assert.equal(history, undefined);
    else {
      assert.equal(direct[0], history);
      assert.equal(
        text(nodes.find((node) => node.type === "summary")),
        `Show history (${count - 1} earlier ${count === 2 ? "change" : "changes"})`,
      );
    }
  }
});

test("initial decision and reason saves become one history line per decision", () => {
  const events = [
    decision("retain", 1, "entity"),
    {
      ...decision("retain-reason", 2, "entity"),
      decisionReason: "influences_work",
    },
    { ...decision("remove", 3, "entity"), decision: "remove" },
    {
      ...decision("remove-reason", 4, "entity"),
      decision: "remove",
      decisionReason: "other",
      otherReason: "Completed work",
    },
  ];
  const [run] = service.conversationTimeline([], events);
  assert.equal(run.decisions.length, 2);
  assert.deepEqual(
    run.decisions.map((d) => d.id),
    ["retain-reason", "remove-reason"],
  );
  assert.equal(run.decisions[0].createdAt, events[0].createdAt);
  assert.equal(run.decisions[1].otherReason, "Completed work");
  assert.equal(run.latest[0].id, "remove-reason");
  assert.equal(events[0].decisionReason, undefined); // Raw audit events stay intact.
});
test("later reason edits and cleared reasons remain separate history entries", () => {
  const [run] = service.conversationTimeline(
    [],
    [
      decision("a", 1, "entity"),
      { ...decision("b", 2, "entity"), decisionReason: "direct_request" },
      { ...decision("c", 3, "entity"), decisionReason: "influences_work" },
      decision("d", 4, "entity"),
    ],
  );
  assert.deepEqual(
    run.decisions.map((d) => d.id),
    ["b", "c", "d"],
  );
});
test("a comment between a decision and a reason preserves both events", () => {
  const entries = service.conversationTimeline(
    [comment("c", 2)],
    [
      decision("a", 1, "entity"),
      { ...decision("b", 3, "entity"), decisionReason: "direct_request" },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ["decisions", "comment", "decisions"],
  );
  assert.equal(entries[0].decisions[0].id, "a");
});
test("different authors, tracks, sessions, replacements, metadata or submission references never merge", () => {
  for (const changes of [
    { userEmail: "other@un.org" },
    { decisionTrack: "review" },
    { reviewSessionId: "different-session" },
    { reviewedSubmissionId: "different-submission" },
    { newSymbol: "A/RES/80/1" },
    { manualMetadata: { title: "Corrected title" } },
    { entity: "DESA" },
    { subprogramme: "4" },
    { documentSymbol: "A/RES/80/2" },
  ]) {
    const [run] = service.conversationTimeline(
      [],
      [
        decision("a", 1, "entity"),
        {
          ...decision("b", 2, "entity"),
          decisionReason: "direct_request",
          ...changes,
        },
      ],
    );
    assert.equal(run.decisions.length, 2, JSON.stringify(changes));
  }
});

test("history shows one line per decision with its actual reason icon and the corrected earlier-change count", () => {
  const harness = composerHarness(
    async () => null,
    {
      decisions: [
        decision("retain", 1, "entity"),
        {
          ...decision("retain-reason", 2, "entity"),
          decisionReason: "influences_work",
        },
        { ...decision("remove", 3, "entity"), decision: "remove" },
        {
          ...decision("remove-reason", 4, "entity"),
          decision: "remove",
          decisionReason: "other",
          otherReason: "Completed work",
        },
      ],
    },
    undefined,
    true,
  );
  const walk = (node) =>
    Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === "object"
        ? [node, ...walk(node.props?.children)]
        : [];
  const text = (node) =>
    Array.isArray(node)
      ? node.map(text).join("")
      : node && typeof node === "object"
        ? text(node.props?.children)
        : (node ?? "");
  const tree = harness.render(),
    all = walk(tree);
  const buttons = all.filter(
    (node) =>
      node.type === "button" && node.props["aria-label"]?.startsWith("Reason:"),
  );
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props.children.type, "Lightbulb");
  assert.equal(buttons[1].props.children.type, "MessageSquare");
  assert.equal(buttons[1].props["aria-label"], "Reason: Completed work");
  assert.match(
    text(all.find((node) => node.type === "summary")),
    /Show history \(1 earlier change\)/,
  );
});
