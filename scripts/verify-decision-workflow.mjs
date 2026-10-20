// Deterministic workflow checks: real component/action code, fake React hooks and
// server dependencies. No browser, database connection, or writes are involved.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import * as React from "react";

function loadSource(file, dependencies) {
  const filename = path.resolve(file);
  const localRequire = createRequire(filename);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name === "react/jsx-runtime") return localRequire(name);
    throw new Error(`Unexpected dependency in workflow check: ${name}`);
  });
  return exports;
}

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
  } else if (React.isValidElement(node)) {
    if (predicate(node)) return node;
    return find(node.props.children, predicate);
  }
  return undefined;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function dropdown(props) {
  let cursor = 0;
  const slots = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
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
    useEffect() {},
  };
  function ReasonPopup() {}
  function Placeholder() {}
  const colors = { bg: "", border: "", text: "", hover: "" };
  const { DecisionDropdown } = loadSource(
    "src/components/DecisionDropdown.tsx",
    {
      react: hooks,
      "react-dom": { createPortal: (node) => node },
      "lucide-react": {
        ChevronDown: Placeholder,
        Pencil: Placeholder,
        MessageCircle: Placeholder,
      },
      "@/lib/theme": {
        DECISION_THEME: Object.fromEntries(
          ["default", "retain", "remove", "add", "update", "cancel"].map(
            (key) => [key, colors],
          ),
        ),
        POPUP_STYLES: {},
      },
      "../features/mandates/ui/ReasonsModal": {
        ReasonPopup,
        getReasonDisplayLabel: () => null,
        renderReasonIcon: () => null,
        renderLabelWithBold: (text) => text,
      },
      "@/components/ui/popover": {
        Popover: Placeholder,
        PopoverContent: Placeholder,
        PopoverTrigger: Placeholder,
      },
    },
  );
  const render = (changes = {}) => {
    props = { ...props, ...changes };
    cursor = 0;
    return DecisionDropdown(props);
  };
  const select = () => {
    const previous = global.document;
    global.document = { body: {} };
    try {
      find(render(), (node) => node.type === "button").props.onClick();
      return find(render(), (node) => node.type.name === "DropdownMenu").props
        .onSelect;
    } finally {
      global.document = previous;
    }
  };
  return {
    render,
    select,
    popup: (node) => find(node, (element) => element.type === ReasonPopup),
  };
}

test("fast reason selection waits for the persisted decision and blocks the pencil", async () => {
  const save = deferred();
  let saves = 0;
  let reasons = 0;
  const ui = dropdown({
    decision: "retain",
    onChange: () => {
      saves++;
      return save.promise;
    },
    onReasonChange: () => {
      reasons++;
      return true;
    },
  });
  const select = ui.select();
  const pending = select("remove");
  await select("retain"); // Repeated clicks from the old menu cannot create another event.
  let tree = ui.render({ decision: "remove" });
  assert.equal(saves, 1);
  assert.equal(ui.popup(tree).props.isOpen, false);
  const pencil = find(
    tree,
    (node) =>
      node.type === "button" &&
      node.props.onClick.toString().includes("stopPropagation"),
  );
  assert.equal(pencil.props.disabled, true);
  pencil.props.onClick({ stopPropagation() {} });
  assert.equal(ui.popup(ui.render()).props.isOpen, false);
  save.resolve(true);
  await pending;
  tree = ui.render();
  assert.equal(ui.popup(tree).props.isOpen, true);
  ui.popup(tree).props.onChange("delivered", null);
  assert.equal(reasons, 1);
});

test("external update popups stay closed while the optimistic decision has no saved ID", () => {
  const ui = dropdown({
    decision: "update",
    disabled: true,
    showReasonPopup: true,
    onChange: async () => true,
    onReasonChange: async () => true,
  });
  const tree = ui.render();
  assert.equal(ui.popup(tree).props.isOpen, false);
});

test("reason saves block repeated edits until persistence finishes", async () => {
  const reason = deferred();
  let calls = 0;
  const ui = dropdown({
    decision: "remove",
    onChange: async () => true,
    onReasonChange: () => {
      calls++;
      return reason.promise;
    },
  });
  const callback = ui.popup(ui.render()).props.onChange;
  const pending = callback("delivered", null);
  await callback("other", "second click");
  assert.equal(calls, 1);
  assert.equal(ui.render().props["aria-busy"], true);
  reason.resolve(true);
  await pending;
  assert.equal(ui.render().props["aria-busy"], false);
});

test("failed and throwing saves never open a reason popup", async () => {
  for (const onChange of [
    async () => false,
    async () => {
      throw new Error("offline");
    },
  ]) {
    const ui = dropdown({ decision: "retain", onChange, onReasonChange() {} });
    await ui.select()("remove");
    const tree = ui.render();
    assert.equal(ui.popup(tree).props.isOpen, false);
    assert.ok(find(tree, (node) => node.props.role === "alert"));
  }
});

test("cancel never opens a reason popup and update waits for replacement selection", async () => {
  const saved = [];
  let updates = 0;
  const ui = dropdown({
    decision: "remove",
    onChange: async (value) => {
      saved.push(value);
      return true;
    },
    onReasonChange: async () => true,
    onUpdateClick() {
      updates++;
    },
  });
  await ui.select()("");
  assert.deepEqual(saved, ["cancel"]);
  assert.equal(ui.popup(ui.render()).props.isOpen, false);
  await ui.select()("update");
  assert.equal(updates, 1);
  assert.deepEqual(saved, ["cancel"]);
});

function actions() {
  const statements = [];
  const source = {
    id: "old",
    document_symbol: "A/RES/80/1",
    entity: "UNOMS",
    subprogramme: "Programme 1",
    decision: "update",
    new_symbol: "A/RES/80/2",
    manual_metadata: {},
    decision_reason: "other",
    other_reason: "Preserved explanation",
    user_email: "reviewer@un.org",
    review_session_id: "session-1",
  };
  const api = loadSource("src/features/mandates/actions/decisions.ts", {
    "@/lib/db/review-cycle": {
      getReviewWriteError: async (version) =>
        version === "ppb2027" ? null : "read-only",
    },
    "@/features/auth/auth": {
      getCurrentUser: async () => ({
        email: "reviewer@un.org",
        entity: "UNOMS",
        canReviewAnyEntity: true,
        isReviewer: true,
      }),
    },
    "next/cache": { revalidatePath() {} },
    "./review-mode": { checkReviewModeBlock: async () => null },
    "@/lib/db/db": {
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes("FROM mandates_housekeeping.entity_review_mode"))
          return [{ id: "session-1" }];
        if (sql.includes("WITH inserted") && sql.includes("VALUES")) {
          return [
            {
              ...source,
              id: "new",
              decision_reason: params[6],
              other_reason: params[7],
              review_session_id: params[9],
            },
          ];
        }
        if (sql.includes("WITH inserted"))
          return [
            {
              ...source,
              id: "reason-event",
              decision_reason: params[1],
              other_reason: params[2],
            },
          ];
        return [source];
      },
    },
  });
  return { api, statements, source };
}

test("manual metadata edits can preserve the existing reason on the new event", async () => {
  const { api, statements } = actions();
  const result = await api.createDecisionAction(
    {
      documentSymbol: "A/RES/80/1",
      entity: "UNOMS",
      subprogramme: "Programme 1",
      decision: "update",
      newSymbol: "A/RES/80/2",
      manualMetadata: { title: "Revised title" },
      decisionReason: "other",
      otherReason: "Preserved explanation",
    },
    "ppb2027",
  );
  assert.equal(result.success, true);
  assert.equal(result.data.decisionReason, "other");
  assert.equal(result.data.otherReason, "Preserved explanation");
  assert.equal(result.data.reviewSessionId, "session-1");
  assert.equal(statements.at(-1).params[6], "other");
});

test("reason history preserves the source review session and appends an event", async () => {
  const { api, statements } = actions();
  const result = await api.updateDecisionReasonAction(
    {
      decisionId: "old",
      decisionReason: "superseded_identical",
      otherReason: "Discard this",
    },
    "ppb2027",
  );
  assert.equal(result.success, true);
  assert.notEqual(result.data.id, "old");
  assert.equal(result.data.reviewSessionId, "session-1");
  assert.equal(result.data.otherReason, null);
  assert.match(
    statements.at(-1).sql,
    /\$4,\s*--[^\n]*\n\s*review_session_id\s+FROM/,
  );
});

test("archived or missing originating cycles reject before any mocked database access", async () => {
  for (const version of ["ppb2026", undefined]) {
    const { api, statements } = actions();
    const result = await api.createDecisionAction(
      {
        documentSymbol: "A/RES/80/1",
        entity: "UNOMS",
        subprogramme: null,
        decision: "remove",
      },
      version,
    );
    assert.equal(result.success, false);
    assert.equal(statements.length, 0);
  }
});
