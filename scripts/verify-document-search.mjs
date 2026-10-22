// Deterministic request lifecycle checks; no browser, DB, or server required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const compiled = ts.transpileModule(
  readFileSync("src/hooks/useDocumentSearch.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const settle = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};
function harness() {
  let current;
  const timers = new Set(),
    requests = [];
  const react = {
    useState(initial) {
      const actor = current,
        index = actor.cursor++;
      if (!(index in actor.slots)) actor.slots[index] = initial;
      return [
        actor.slots[index],
        (next) => {
          actor.writes++;
          actor.slots[index] =
            typeof next === "function" ? next(actor.slots[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = current.cursor++;
      return (current.slots[index] ??= { current: initial });
    },
    useMemo(factory, deps) {
      const index = current.cursor++;
      const previous = current.slots[index];
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous.deps[i]))
      )
        current.slots[index] = { deps, value: factory() };
      return current.slots[index].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(effect, deps) {
      const actor = current,
        index = actor.cursor++,
        previous = actor.slots[index];
      if (
        !previous ||
        deps.some((value, i) => !Object.is(value, previous.deps[i]))
      ) {
        actor.effects.push(() => {
          previous?.cleanup?.();
          actor.slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const exports = {};
  new Function("exports", "require", "setTimeout", "clearTimeout", compiled)(
    exports,
    (name) => {
      if (name === "react") return react;
      return {
        searchDocumentsAction(query) {
          let resolve, reject;
          const pending = new Promise((a, b) => {
            resolve = a;
            reject = b;
          });
          requests.push({ query, resolve, reject });
          return pending;
        },
      };
    },
    (fn) => {
      timers.add(fn);
      return fn;
    },
    (fn) => timers.delete(fn),
  );
  return {
    requests,
    tick() {
      const pending = [...timers];
      timers.clear();
      pending.forEach((fn) => fn());
    },
    input() {
      const actor = { slots: [], cursor: 0, effects: [], writes: 0 };
      let query = "",
        active = true;
      return {
        render(next = {}) {
          query = next.query ?? query;
          active = next.active ?? active;
          current = actor;
          actor.cursor = 0;
          actor.effects = [];
          const result = exports.useDocumentSearch(query, active);
          actor.effects.forEach((effect) => effect());
          return result;
        },
        unmount() {
          actor.slots.forEach((slot) => slot?.cleanup?.());
        },
        writes: () => actor.writes,
      };
    },
  };
}
const doc = (symbol) => ({ symbol, title: symbol, body: "GA", year: 2022 });

test("two inputs search independently, including the second input", async () => {
  const h = harness(),
    first = h.input(),
    second = h.input();
  first.render({ query: "A/RES/77/278" });
  second.render({ query: "test" });
  h.tick();
  assert.deepEqual(
    h.requests.map((r) => r.query),
    ["A/RES/77/278", "test"],
  );
  h.requests[1].resolve([doc("A/RES/80/1")]);
  h.requests[0].resolve([doc("A/RES/77/278")]);
  await settle();
  assert.equal(first.render().results[0].symbol, "A/RES/77/278");
  assert.equal(second.render().results[0].symbol, "A/RES/80/1");
});
test("typing debounces requests, trims whitespace, and hides results for old queries immediately", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "a" });
  h.tick();
  assert.equal(h.requests.length, 0);
  input.render({ query: "a/" });
  input.render({ query: " a/res/77/278 " });
  h.tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].query, "a/res/77/278");
  h.requests[0].resolve([doc("A/RES/77/278")]);
  await settle();
  assert.equal(input.render().results.length, 1);
  assert.deepEqual(input.render({ query: "different" }).results, []);
});
test("a slow old response cannot replace newer results", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "old" });
  h.tick();
  input.render({ query: "new" });
  h.tick();
  h.requests[1].resolve([doc("new")]);
  await settle();
  h.requests[0].resolve([doc("old")]);
  await settle();
  assert.equal(input.render().results[0].symbol, "new");
});
test("old requests cannot stop the current loading indicator", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "old" });
  h.tick();
  input.render({ query: "new" });
  h.tick();
  h.requests[0].reject(new Error("old request failed"));
  await settle();
  assert.equal(input.render().searching, true);
  assert.equal(input.render().searchError, false);
  h.requests[1].resolve([]);
  await settle();
  assert.equal(input.render().searchDone, true);
});
test("leaving an input prevents a late response from changing it", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "first" });
  h.tick();
  input.render({ active: false });
  const writes = input.writes();
  h.requests[0].resolve([doc("first")]);
  await settle();
  assert.equal(input.writes(), writes);
  assert.equal(input.render().searchDone, false);
});
test("clearing the input cancels its debounce and invalidates pending results", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "query" });
  input.render({ query: "" });
  h.tick();
  assert.equal(h.requests.length, 0);
  input.render({ query: "query" });
  h.tick();
  input.render({ query: "q" });
  h.requests[0].resolve([doc("query")]);
  await settle();
  assert.deepEqual(input.render().results, []);
  assert.equal(input.render().searching, false);
});
test("failures are distinct from no matches and retry succeeds", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "query" });
  h.tick();
  h.requests[0].reject(new Error("network"));
  await settle();
  const failed = input.render();
  assert.equal(failed.searchError, true);
  assert.equal(failed.searchDone, false);
  failed.retry();
  input.render();
  h.tick();
  h.requests[1].resolve([]);
  await settle();
  assert.equal(input.render().searchError, false);
  assert.equal(input.render().searchDone, true);
});
test("refocusing the same query cannot accept the previous focus session's response", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "query" });
  h.tick();
  input.render({ active: false });
  input.render({ active: true });
  h.tick();
  h.requests[0].resolve([doc("old")]);
  await settle();
  assert.deepEqual(input.render().results, []);
  h.requests[1].resolve([doc("new")]);
  await settle();
  assert.equal(input.render().results[0].symbol, "new");
});
test("unmount cancels timers and ignores in-flight responses", async () => {
  const h = harness(),
    before = h.input();
  before.render({ query: "query" });
  before.unmount();
  h.tick();
  assert.equal(h.requests.length, 0);
  const pending = h.input();
  pending.render({ query: "query" });
  h.tick();
  pending.unmount();
  const writes = pending.writes();
  h.requests[0].resolve([doc("query")]);
  await settle();
  assert.equal(pending.writes(), writes);
});

test("retyping the same query before debounce cannot reuse the earlier result", async () => {
  const h = harness(),
    input = h.input();
  input.render({ query: "first" });
  h.tick();
  h.requests[0].resolve([doc("old")]);
  await settle();
  assert.equal(input.render().results[0].symbol, "old");
  input.render({ query: "second" });
  assert.deepEqual(input.render({ query: "first" }).results, []);
  h.tick();
  h.requests[1].resolve([doc("fresh")]);
  await settle();
  assert.equal(input.render().results[0].symbol, "fresh");
});
test("editing or selecting invalidates an in-flight response before the next render", async () => {
  for (const query of ["edited", ""]) {
    const h = harness(),
      input = h.input();
    const state = input.render({ query: "query" });
    h.tick();
    state.invalidate();
    const writes = input.writes();
    h.requests[0].resolve([doc("stale")]);
    await settle();
    assert.equal(input.writes(), writes);
    assert.deepEqual(input.render({ query }).results, []);
  }
});
