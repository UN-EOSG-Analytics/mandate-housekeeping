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

const sharedTypography = loadSource(
  createRequire(import.meta.url).resolve("@un-eosg/ui/typography"),
  {},
);

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
      "@un-eosg/ui/typography": sharedTypography,
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

test("reason popup opens immediately and a fast choice waits for the exact saved event", async () => {
  const save = deferred();
  let saves = 0;
  const reasons = [];
  const ui = dropdown({
    decision: "retain",
    onChange: () => {
      saves++;
      return save.promise;
    },
    onReasonChange: async (reason, text, decision) => {
      reasons.push({ reason, text, decision });
      return true;
    },
  });
  const select = ui.select();
  const pending = select("remove");
  await select("retain");
  const tree = ui.render({ decision: "remove", disabled: true });
  assert.equal(saves, 1);
  assert.equal(ui.popup(tree).props.isOpen, true);
  const pencil = find(
    tree,
    (node) =>
      node.type === "button" &&
      node.props.onClick.toString().includes("stopPropagation"),
  );
  assert.equal(pencil.props.disabled, true);
  const queuedReason = ui.popup(tree).props.onChange("delivered", null);
  ui.popup(tree).props.onClose();
  assert.equal(reasons.length, 0);
  const saved = { id: "new-event", decision: "remove", decisionReason: null };
  save.resolve(saved);
  await Promise.all([pending, queuedReason]);
  assert.deepEqual(reasons, [
    { reason: "delivered", text: null, decision: saved },
  ]);
});

test("a dismissed initial popup keeps saving the decision without a reason", async () => {
  const save = deferred();
  let reasons = 0;
  const ui = dropdown({
    decision: null,
    onChange: () => save.promise,
    onReasonChange: async () => {
      reasons++;
      return true;
    },
  });
  const pending = ui.select()("remove");
  const popup = ui.popup(ui.render());
  assert.equal(popup.props.isOpen, true);
  popup.props.onClose();
  save.resolve({ id: "saved", decision: "remove" });
  await pending;
  assert.equal(reasons, 0);
  assert.equal(ui.popup(ui.render({ decision: "remove" })).props.isOpen, false);
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

test("failed and throwing saves close the popup and report failure", async () => {
  for (const onChange of [
    async () => null,
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
      return { id: "saved" };
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

const tracks = loadSource(
  "src/features/mandates/services/decision-tracks.ts",
  {},
);

function actions({
  reviewer = true,
  activeReview = true,
  sourceTrack = "review",
  ownEntity = "UNOMS",
  canReviewAny = reviewer,
  latestId = "old",
  noSubmission = false,
} = {}) {
  const statements = [];
  let transactionCount = 0;
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
    review_active: activeReview,
    created_at: "2026-10-20T10:00:00.000Z",
    decision_track: sourceTrack,
    reviewed_submission_id: "submission",
  };
  const runQuery = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes("SELECT * FROM mandates_housekeeping.mandate_decisions"))
      return noSubmission
        ? []
        : [
            {
              ...source,
              id: "submission",
              decision_track: "entity",
              reviewed_submission_id: null,
            },
          ];
    if (sql.includes("SELECT id FROM mandates_housekeeping.mandate_decisions"))
      return [{ id: latestId }];
    if (/SELECT id FROM mandates_housekeeping.entity_review_mode/.test(sql))
      return activeReview ? [{ id: "session-1" }] : [];
    if (sql.includes("WITH inserted") && sql.includes("VALUES")) {
      return [
        {
          ...source,
          id: "new",
          decision_reason: params[6],
          other_reason: params[7],
          review_session_id: params[9],
          decision: params[3],
          new_symbol: params[4],
          manual_metadata: params[5] ? JSON.parse(params[5]) : null,
          decision_track: params[10],
          reviewed_submission_id: params[11],
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
          review_session_id: params[4],
        },
      ];
    return [source];
  };
  const api = loadSource("src/features/mandates/actions/decisions.ts", {
    "@/lib/db/review-lock": {
      lockEntityReview: async (tx, entity) => {
        assert.equal(tx, runQuery);
        statements.push({ sql: "LOCK " + entity, params: [] });
      },
    },
    "../services/decision-tracks": tracks,
    "../services/comment-notifications": {},
    "@/lib/db/review-cycle": {
      getBudgetVersion: async () => "ppb2027",
      getReviewWriteError: async (version) =>
        version === "ppb2027" ? null : "read-only",
    },
    "@/features/auth/auth": {
      getCurrentUser: async (tx) => {
        assert.equal(tx, runQuery, "Auth must use the same transaction");
        return {
          email: "reviewer@un.org",
          entity: ownEntity,
          canReviewAnyEntity: canReviewAny,
          isReviewer: reviewer,
        };
      },
    },
    "next/cache": {
      revalidatePath() {
        assert.fail("Decision saves must not rerender the citation page");
      },
    },
    "./review-mode": {
      checkReviewModeBlock: async () => {
        assert.fail("Reuse the scoped review lookup");
      },
    },
    "@/lib/db/db": {
      query: async () => {
        assert.fail("Decision saves must not open separate query transactions");
      },
      transaction: async (fn) => {
        transactionCount++;
        return fn(runQuery);
      },
    },
  });
  return {
    api,
    statements,
    source,
    get transactionCount() {
      return transactionCount;
    },
  };
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
      decisionTrack: "review",
      reviewedSubmissionId: "submission",
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

test("reason history preserves submission reference and appends in the current session", async () => {
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
    /\$5, decision_track, reviewed_submission_id, clock_timestamp\(\)/,
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

test("active review blocks entity reviewers but permits authorised reviewers in one transaction", async () => {
  for (const reviewer of [false, true]) {
    const fixture = actions({ reviewer, activeReview: true });
    const result = await fixture.api.createDecisionAction(
      {
        documentSymbol: "A/RES/80/1",
        entity: "UNOMS",
        subprogramme: null,
        decision: "remove",
        decisionTrack: reviewer ? "review" : "entity",
        reviewedSubmissionId: "submission",
      },
      "ppb2027",
    );
    assert.equal(result.success, reviewer);
    assert.equal(fixture.transactionCount, 1);
    if (!reviewer) assert.equal(result.error, "review_mode_blocked");
  }
});

test("a failed initial decision never attempts its queued reason write", async () => {
  const save = deferred();
  let reasons = 0;
  const ui = dropdown({
    decision: null,
    onChange: () => save.promise,
    onReasonChange: async () => {
      reasons++;
      return true;
    },
  });
  const pending = ui.select()("remove");
  const queued = ui.popup(ui.render()).props.onChange("delivered", null);
  save.resolve(null);
  await Promise.all([pending, queued]);
  assert.equal(reasons, 0);
  assert.equal(ui.popup(ui.render({ decision: "retain" })).props.isOpen, false);
});

test("agree snapshots full latest submission and ignores caller-supplied decision data", async () => {
  const { api, source, statements } = actions({ activeReview: false });
  const result = await api.createDecisionAction(
    {
      documentSymbol: source.document_symbol,
      entity: source.entity,
      subprogramme: source.subprogramme,
      decision: "remove",
      newSymbol: "WRONG",
      decisionReason: "WRONG",
      decisionTrack: "review",
      reviewedSubmissionId: "submission",
      agreeWithSubmission: true,
    },
    "ppb2027",
  );
  assert.equal(result.success, true);
  assert.equal(result.data.decision, "update");
  assert.equal(result.data.newSymbol, source.new_symbol);
  assert.equal(result.data.decisionReason, source.decision_reason);
  assert.equal(result.data.otherReason, source.other_reason);
  assert.deepEqual(result.data.manualMetadata, source.manual_metadata);
  assert.equal(result.data.decisionTrack, "review");
  assert.equal(result.data.reviewedSubmissionId, "submission");
  assert.equal(
    result.data.reviewSessionId,
    null,
    "Review edits are permitted outside sessions",
  );
  assert.ok(
    statements.findIndex((x) => x.sql.startsWith("LOCK")) <
      statements.findIndex((x) => x.sql.includes("SELECT *")),
  );
});

test("stale submission references and cross-track ownership reject before insert", async () => {
  const cases = [
    { reviewer: true, decisionTrack: "review", reviewedSubmissionId: "older" },
    {
      reviewer: true,
      ownEntity: "OTHER",
      decisionTrack: "entity",
      reviewedSubmissionId: "submission",
    },
    {
      reviewer: false,
      decisionTrack: "review",
      reviewedSubmissionId: "submission",
    },
  ];
  for (const scenario of cases) {
    const { api, statements } = actions({ ...scenario, activeReview: false });
    const result = await api.createDecisionAction(
      {
        documentSymbol: "A/RES/80/1",
        entity: "UNOMS",
        subprogramme: null,
        decision: "retain",
        ...scenario,
      },
      "ppb2027",
    );
    assert.equal(result.success, false);
    assert.equal(
      statements.some((x) => x.sql.includes("INSERT INTO")),
      false,
    );
  }
});

test("reviewer entity scope is enforced on decisions and reason edits", async () => {
  const { api, statements } = actions({
    reviewer: true,
    ownEntity: "OTHER",
    canReviewAny: false,
  });
  const created = await api.createDecisionAction(
    {
      documentSymbol: "A/RES/80/1",
      entity: "UNOMS",
      subprogramme: null,
      decision: "remove",
      decisionTrack: "review",
      reviewedSubmissionId: "submission",
    },
    "ppb2027",
  );
  const reason = await api.updateDecisionReasonAction(
    { decisionId: "old", decisionReason: "other", otherReason: "No" },
    "ppb2027",
  );
  assert.equal(created.success, false);
  assert.equal(reason.success, false);
  assert.equal(
    statements.some((x) => x.sql.includes("INSERT INTO")),
    false,
  );
});

test("reason edits cannot revive superseded decisions and obey submission lock", async () => {
  for (const options of [
    { latestId: "newer" },
    { reviewer: false, sourceTrack: "entity", activeReview: true },
  ]) {
    const { api, statements } = actions(options);
    const result = await api.updateDecisionReasonAction(
      { decisionId: "old", decisionReason: "other", otherReason: "Changed" },
      "ppb2027",
    );
    assert.equal(result.success, false);
    assert.equal(
      statements.some((x) => x.sql.includes("INSERT INTO")),
      false,
    );
  }
});

function event(id, track, decision, reviewedSubmissionId = null, seconds = 0) {
  return {
    id,
    decisionTrack: track,
    decision,
    reviewedSubmissionId,
    createdAt: new Date(1000 * seconds).toISOString(),
  };
}

test("tracks resolve independently; review retain overrides entity remove and clear restores fallback", () => {
  const submission = event("s1", "entity", "remove", null, 1);
  const review = event("r1", "review", "retain", "s1", 2);
  assert.equal(
    tracks.getEffectiveDecision([review, submission], "entity").id,
    "s1",
  );
  assert.equal(
    tracks.getEffectiveDecision([review, submission], "reviewed").id,
    "r1",
  );
  const clear = event("r2", "review", "cancel", "s1", 3);
  assert.equal(
    tracks.getEffectiveDecision([clear, submission, review], "reviewed").id,
    "s1",
  );
});

test("changed and cancelled submissions stale prior review; reaffirmation restores it", () => {
  const submission = event("s1", "entity", "remove", null, 1);
  const review = event("r1", "review", "retain", "s1", 2);
  for (const decision of ["remove", "cancel"]) {
    const changed = event("s2", "entity", decision, null, 3);
    const history = [review, changed, submission];
    assert.equal(tracks.getDecisionTracks(history).reviewStale, true);
    assert.equal(tracks.getEffectiveDecision(history, "reviewed").id, "s2");
    const confirmed = event("r2", "review", "retain", "s2", 4);
    assert.equal(
      tracks.getEffectiveDecision([...history, confirmed], "reviewed").id,
      "r2",
    );
  }
});

test("reviewer-only additions with no submission remain current and ties resolve by id", () => {
  const review = event("r1", "review", "add", null, 2);
  assert.equal(tracks.getDecisionTracks([review]).reviewStale, false);
  assert.equal(tracks.getEffectiveDecision([review], "entity"), null);
  assert.equal(tracks.getEffectiveDecision([review], "reviewed").id, "r1");
  assert.equal(
    tracks.getDecisionTracks([
      event("z", "entity", "retain"),
      event("a", "entity", "remove"),
    ]).submission.id,
    "z",
  );
});

function reviewControl(props, context = null) {
  const calls = [];
  const saved = [];
  const api = loadSource("src/components/ReviewDecisionControl.tsx", {
    react: {
      ...React,
      useContext: () => context,
      useRef: (current) => ({ current }),
      useState: (initial) => [initial, () => {}],
    },
    "@/features/mandates/actions/decisions": {
      createDecisionAction: async (params, cycle) => {
        calls.push({ params, cycle });
        return { success: true, data: { id: "saved-review", ...params } };
      },
      updateDecisionReasonAction: async (params) => {
        calls.push({ reason: params });
        return { success: true, data: { id: "reason-review" } };
      },
    },
    "@/features/mandates/services/decision-tracks": tracks,
    "@/lib/db/budget-version": { CURRENT_BUDGET_VERSION: "ppb2027" },
    "@/features/mandates/ui/ManualDocumentForm": {
      ManualDocumentForm: "ManualDocumentForm",
    },
    "@/features/mandates/ui/DocumentSearchInput": {
      DocumentSearchInput: "DocumentSearchInput",
    },
    "lucide-react": {
      Copy: "Copy",
      Loader2: "Loader2",
      MoreHorizontal: "MoreHorizontal",
      AlertCircle: "AlertCircle",
      ArrowRightLeft: "ArrowRightLeft",
    },
    "./ui/popover": {
      Popover: "Popover",
      PopoverContent: "PopoverContent",
      PopoverTrigger: "PopoverTrigger",
    },
    "./DecisionDropdown": { DecisionDropdown: "DecisionDropdown" },
    "./ui/dialog": Object.fromEntries(
      ["Dialog", "DialogContent", "DialogHeader", "DialogTitle"].map((name) => [
        name,
        name,
      ]),
    ),
  });
  const tree = api.ReviewDecisionControl({
    entity: "UNOMS",
    symbol: "A/RES/80/1",
    subprogramme: "SP",
    onSaved: (value) => saved.push(value),
    ...props,
  });
  return { tree, calls, saved };
}

test("review controls snapshot agreement, offer stale confirmation, and remain read-only without permission", async () => {
  const submission = {
    ...event("s2", "entity", "remove", null, 3),
    decisionReason: "outdated",
  };
  const review = {
    ...event("r1", "review", "update", "s1", 2),
    newSymbol: "A/RES/80/2",
    decisionReason: "other",
    otherReason: "Review rationale",
    manualMetadata: { title: "Replacement" },
  };
  const ui = reviewControl({ submission, review, editable: true });
  const initial = reviewControl({ submission, review: null, editable: true });
  const copy = find(
    initial.tree,
    (n) =>
      n.type === "button" &&
      n.props["aria-label"] === "Copy submission decision",
  );
  await copy.props.onClick();
  assert.equal(initial.calls[0].params.agreeWithSubmission, true);
  assert.equal(initial.calls[0].params.reviewedSubmissionId, "s2");
  const confirm = find(
    ui.tree,
    (n) =>
      n.type === "button" && n.props.children === "Confirm review decision",
  );
  await confirm.props.onClick();
  assert.equal(ui.calls[0].params.newSymbol, "A/RES/80/2");
  assert.equal(ui.calls[0].params.otherReason, "Review rationale");
  assert.deepEqual(ui.calls[0].params.manualMetadata, { title: "Replacement" });
  assert.equal(ui.calls[0].params.reviewedSubmissionId, "s2");
  const readonly = reviewControl({ submission, review, editable: false });
  assert.equal(
    find(readonly.tree, (n) => n.type === "button"),
    undefined,
  );
  assert.equal(
    find(readonly.tree, (n) => n.type === "DecisionDropdown").props.disabled,
    true,
  );
});

test("session transitions share decision lock, enforce scope and leave decision history untouched", async () => {
  for (const permitted of [false, true]) {
    const statements = [];
    const tx = async (sql) => {
      statements.push(sql);
      return sql.includes("SELECT started_by")
        ? []
        : [{ id: "session", started_at: "now" }];
    };
    const api = loadSource("src/features/mandates/actions/review-mode.ts", {
      "@/lib/db/review-cycle": {
        getReviewWriteError: async (version) =>
          version === "ppb2027" ? null : "read-only",
      },
      "next/cache": { revalidatePath() {} },
      "@/lib/db/db": {
        transaction: (fn) => fn(tx),
        query: () => assert.fail("Use one transaction"),
      },
      "@/features/auth/auth": {
        getCurrentUser: async (executor) => {
          assert.equal(executor, tx);
          return {
            isReviewer: true,
            canReviewAnyEntity: false,
            entity: permitted ? "UNOMS" : "OTHER",
            email: "review@un.org",
          };
        },
      },
      "@/lib/db/review-lock": {
        lockEntityReview: async (executor, entity) => {
          assert.equal(executor, tx);
          assert.equal(entity, "UNOMS");
          statements.push("LOCK");
        },
      },
    });
    const started = await api.startReviewModeAction("UNOMS", "ppb2027");
    const ended = await api.endReviewModeAction("UNOMS", "ppb2027");
    assert.equal(started.success, permitted);
    assert.equal(ended.success, permitted);
    assert.equal(
      statements.some((sql) => sql.includes("mandate_decisions")),
      false,
    );
    if (permitted) {
      assert.equal(statements[0], "LOCK");
      assert.equal(statements[3], "LOCK");
    } else assert.deepEqual(statements, []);
  }
});

test("compact review keeps agreement available without a second line of status text", async () => {
  const submission = { ...event("s1", "entity", "retain", null, 1) };
  const ui = reviewControl({
    submission,
    review: null,
    editable: true,
    compact: true,
  });
  assert.ok(!ui.tree.props.className.includes("flex-col"));
  assert.equal(
    find(
      ui.tree,
      (node) => node.type === "span" && node.props.children === "Not reviewed",
    ),
    undefined,
  );
  const agree = find(
    ui.tree,
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "Copy submission decision",
  );
  assert.ok(agree);
  await agree.props.onClick();
  assert.equal(ui.calls[0].params.agreeWithSubmission, true);
});

test("reviewed rows omit copy while keeping stale confirmation in the actions menu", async () => {
  const submission = event("s2", "entity", "remove", null, 3);
  const review = {
    ...event("r1", "review", "update", "s1", 2),
    newSymbol: "A/RES/80/2",
  };
  const ui = reviewControl({
    submission,
    review,
    editable: true,
    compact: true,
  });
  assert.equal(
    find(
      ui.tree,
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "Copy submission decision",
    ),
    undefined,
  );
  const more = find(
    ui.tree,
    (node) =>
      node.type === "button" &&
      node.props["aria-label"] === "More review actions",
  );
  assert.equal(more.props.title, "Submission changed — review needed");
  assert.equal(ui.tree.props.title, "Replacement: A/RES/80/2");
  assert.ok(
    find(
      ui.tree,
      (node) =>
        node.type === "button" &&
        node.props.children === "Confirm review decision",
    ),
  );
  assert.equal(
    find(
      ui.tree,
      (node) =>
        node.type === "button" &&
        node.props.children === "Copy submission decision",
    ),
    undefined,
  );
  const current = reviewControl({
    submission,
    review: { ...event("r2", "review", "retain", "s2", 4) },
    editable: true,
    compact: true,
  });
  assert.equal(
    find(
      current.tree,
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "More review actions",
    ),
    undefined,
  );
});

test("reviewers can edit their own submission and reasons while review sessions still lock both", async () => {
  for (const activeReview of [false, true]) {
    const fixture = actions({
      reviewer: true,
      activeReview,
      sourceTrack: "entity",
    });
    const created = await fixture.api.createDecisionAction(
      {
        documentSymbol: "A/RES/80/1",
        entity: "UNOMS",
        subprogramme: "Programme 1",
        decision: "retain",
        decisionTrack: "entity",
      },
      "ppb2027",
    );
    const reason = await fixture.api.updateDecisionReasonAction(
      {
        decisionId: "old",
        decisionReason: "other",
        otherReason: "Own entity rationale",
      },
      "ppb2027",
    );
    assert.equal(created.success, !activeReview);
    assert.equal(reason.success, !activeReview);
    if (activeReview) {
      assert.equal(created.error, "review_mode_blocked");
      assert.equal(reason.error, "review_mode_blocked");
      assert.ok(!fixture.statements.some((x) => x.sql.includes("INSERT INTO")));
    } else {
      assert.equal(created.data.decisionTrack, "entity");
      assert.equal(reason.data.decisionTrack, "entity");
    }
  }
});

test("global reviewers cannot edit another entity's primary submission or its reason", async () => {
  const fixture = actions({
    reviewer: true,
    ownEntity: "OTHER",
    canReviewAny: true,
    activeReview: false,
    sourceTrack: "entity",
  });
  const created = await fixture.api.createDecisionAction(
    {
      documentSymbol: "A/RES/80/1",
      entity: "UNOMS",
      subprogramme: null,
      decision: "retain",
      decisionTrack: "entity",
    },
    "ppb2027",
  );
  const reason = await fixture.api.updateDecisionReasonAction(
    {
      decisionId: "old",
      decisionReason: "other",
      otherReason: "Other entity",
    },
    "ppb2027",
  );
  assert.equal(created.success, false);
  assert.equal(reason.success, false);
  assert.ok(!fixture.statements.some((x) => x.sql.includes("INSERT INTO")));
});
