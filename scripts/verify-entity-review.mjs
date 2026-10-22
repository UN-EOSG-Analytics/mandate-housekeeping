// Exercise actual UI callbacks without network/database access. The TypeScript
// AST extracts closures so their asynchronous state transitions remain real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const filename = "src/components/EntityDetail.tsx";
const source = readFileSync(filename, "utf8");
const ast = ts.createSourceFile(
  filename,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes = [];
function visit(node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function callback(name, bindings) {
  const node = nodes.find(
    (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name,
  );
  assert.ok(node, `Missing real callback ${name}`);
  return evaluate(node.initializer.arguments[0], bindings);
}
function evaluate(node, bindings) {
  const js = ts.transpileModule(`const extracted = ${node.getText(ast)};`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return extracted;`)(
    ...Object.values(bindings),
  );
}
const tracksSource = ts.transpileModule(
  readFileSync("src/features/mandates/services/decision-tracks.ts", "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const tracks = {};
new Function("exports", tracksSource)(tracks);
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const symbol = "A/RES/80/1";
const key = `${symbol}:Programme 1`;
const persisted = {
  id: "saved",
  documentSymbol: symbol,
  entity: "UNOMS",
  subprogramme: "Programme 1",
  decision: "retain",
  decisionTrack: "entity",
  createdAt: "2026-10-20T00:00:00.000Z",
  manualMetadata: { title: "Saved title" },
};
function mutations(result) {
  const pending = deferred();
  const store = {
    states: {
      [key]: {
        documentSymbol: symbol,
        entity: "UNOMS",
        subprogramme: "Programme 1",
        decision: persisted,
        decisions: [persisted],
      },
    },
    blocked: false,
  };
  const bindings = {
    userEmail: "reviewer@un.org",
    userEntity: "UNOMS",
    entity: "UNOMS",
    canEditSubmission: true,
    isReviewer: false,
    additionTrack: "entity",
    states: store.states,
    reviewSessionId: null,
    CURRENT_BUDGET_VERSION: "ppb2027",
    getDecisionTracks: tracks.getDecisionTracks,
    createDecisionAction: () => pending.promise,
    showError: () => {},
    refreshReviewChanges: () => {},
    onTrackSaved: () => {},
    setStates: (update) => {
      store.states =
        typeof update === "function" ? update(store.states) : update;
    },
    setShowReviewBlockedDialog: (value) => {
      store.blocked = value;
    },
    setTimeout: (fn) => fn(),
  };
  bindings.rollbackDecision = callback("rollbackDecision", bindings);
  return {
    store,
    bindings,
    reject: () => pending.resolve({ success: false, error: result }),
  };
}
for (const error of ["review_mode_blocked", "offline"]) {
  test(`rejected optimistic decision, manual update and addition restore persisted history: ${error}`, async () => {
    for (const operation of [
      "handleDecision",
      "handleUpdateWithManual",
      "handleAddManual",
    ]) {
      const fixture = mutations(error);
      const handler = callback(operation, fixture.bindings);
      const data = { symbol, title: "Unsaved title", year: "2026" };
      const pending =
        operation === "handleDecision"
          ? handler(symbol, "Programme 1", "remove")
          : operation === "handleUpdateWithManual"
            ? handler(symbol, "Programme 1", "A/RES/81/1", data)
            : handler("Programme 1", data);
      assert.equal(fixture.store.states[key].decision.id, "", operation);
      fixture.reject();
      await pending;
      assert.equal(fixture.store.states[key].decision.id, "saved", operation);
      assert.deepEqual(
        fixture.store.states[key].decisions,
        [persisted],
        operation,
      );
      assert.equal(
        fixture.store.blocked,
        error === "review_mode_blocked",
        operation,
      );
    }
  });
  test(`rejected manual metadata restores original metadata: ${error}`, async () => {
    const fixture = mutations(error);
    const handler = callback("handleEditManual", fixture.bindings);
    const pending = handler(symbol, "Programme 1", {
      title: "Unsaved title",
      year: "2026",
    });
    assert.equal(
      fixture.store.states[key].decision.manualMetadata.title,
      "Unsaved title",
    );
    fixture.reject();
    await pending;
    assert.deepEqual(fixture.store.states[key].decision.manualMetadata, {
      title: "Saved title",
    });
  });
}
function initialLoad({ optionalFailure = false } = {}) {
  const store = {};
  const requests = {
    role: deferred(),
    decisions: deferred(),
    review: deferred(),
  };
  const bindings = {
    entity: "UNOMS",
    cycleReadOnly: false,
    loadKey: "UNOMS:ppb2027",
    budgetVersion: "ppb2027",
    FEATURE_FLAGS: { reviewChangeIndicator: optionalFailure },
    getEntityReviewChangesAction: async () => {
      throw new Error("Optional indicator unavailable");
    },
    getUserRoleAction: () => requests.role.promise,
    getEntityDecisionsAction: () => requests.decisions.promise,
    getReviewModeStatusAction: () => requests.review.promise,
  };
  for (const name of [
    "States",
    "TotalComments",
    "IsReviewer",
    "CanReviewAnyEntity",
    "UserEmail",
    "UserEntity",
    "IsUnderReview",
    "ReviewStartedBy",
    "ReviewSessionId",
    "ReviewModeLoaded",
    "InitialStatus",
  ]) {
    bindings[`set${name}`] = (value) => {
      store[name] = value;
    };
  }
  const node = nodes.find(
    (node) =>
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === "useEffect" &&
      node.arguments[0].getText(ast).includes("getUserRoleAction()"),
  );
  return {
    store,
    requests,
    run: () => evaluate(node.arguments[0], bindings)(),
  };
}
const role = {
  success: true,
  data: { email: "reviewer@un.org", entity: "UNOMS", isReviewer: true },
};
const decisions = {
  success: true,
  data: {
    states: [
      {
        documentSymbol: symbol,
        subprogramme: "Programme 1",
        decision: persisted,
      },
    ],
    totalComments: { [symbol]: 2 },
  },
};
const review = {
  success: true,
  data: {
    isUnderReview: true,
    startedBy: "other@un.org",
    reviewSessionId: "session",
  },
};
test("initial load never publishes partial permissions/history; failure can be retried", async () => {
  const failed = initialLoad();
  failed.run();
  failed.requests.role.resolve(role);
  failed.requests.review.resolve(review);
  await settle();
  assert.equal(failed.store.InitialStatus?.loaded, undefined);
  assert.equal(failed.store.UserEmail, undefined);
  failed.requests.decisions.resolve({ success: false, error: "offline" });
  await settle();
  assert.match(failed.store.InitialStatus?.error, /retry/);
  assert.equal(failed.store.InitialStatus?.loaded, false);
  const retried = initialLoad();
  retried.run();
  retried.requests.role.resolve(role);
  retried.requests.decisions.resolve(decisions);
  retried.requests.review.resolve(review);
  await settle();
  assert.equal(retried.store.InitialStatus?.loaded, true);
  assert.equal(retried.store.IsUnderReview, true);
  assert.equal(retried.store.States[key].decision.id, "saved");
  assert.equal(retried.store.UserEmail, role.data.email);
});
test("late initial response after unmount cannot publish state", async () => {
  const fixture = initialLoad();
  const cleanup = fixture.run();
  cleanup();
  fixture.requests.role.resolve(role);
  fixture.requests.decisions.resolve(decisions);
  fixture.requests.review.resolve(review);
  await settle();
  assert.deepEqual(fixture.store, {});
});

test("optional review-change failure preserves the valid required snapshot", async () => {
  const fixture = initialLoad({ optionalFailure: true });
  fixture.run();
  fixture.requests.role.resolve(role);
  fixture.requests.decisions.resolve(decisions);
  fixture.requests.review.resolve(review);
  await settle();
  assert.deepEqual(fixture.store.InitialStatus, {
    context: "UNOMS:ppb2027",
    loaded: true,
    error: null,
  });
});
