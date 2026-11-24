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
        return {
          jsx: (type, props, key) =>
            React.createElement(type, { ...props, key }),
          jsxs: (type, props, key) =>
            React.createElement(type, { ...props, key }),
        };
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
    useId: () => "test-id",
    useMemo: (fn) => fn(),
    useTransition: () => [false, (fn) => fn()],
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

test("verification can recover after both token-check and sign-in network failures", async () => {
  const h = hooks(),
    checks = [],
    signIns = [],
    routes = [];
  const { VerifyForm } = load("src/features/auth/ui/VerifyForm.tsx", {
    react: h.react,
    "next/navigation": {
      useSearchParams: () => new URLSearchParams("token=test"),
      useRouter: () => ({ push: (path) => routes.push(path) }),
    },
    "@/features/auth/ui/EntityCombobox": { EntityCombobox() {} },
    "@/features/auth/navigation": { MY_SUBMISSION_PATH: "/my-submission" },
    "@/features/auth/actions": {
      checkEntityForTokenAction() {
        const d = deferred();
        checks.push(d);
        return d.promise;
      },
      verifyMagicTokenAction() {
        const d = deferred();
        signIns.push(d);
        return d.promise;
      },
    },
  });
  const render = () => h.render(() => VerifyForm({ entities: [] }));
  render();
  checks[0].reject(new Error("offline"));
  await settle();
  let tree = render();
  assert.ok(find(tree, (n) => n.props.role === "alert"));
  find(tree, (n) => n.type === "button").props.onClick();
  render();
  checks[1].resolve({
    success: true,
    data: { email: "test@un.org", hasEntity: true, entity: "DESA" },
  });
  await settle();
  tree = render();
  let completion = find(tree, (n) => n.type === "button").props.onClick();
  assert.equal(find(render(), (n) => n.type === "button").props.disabled, true);
  signIns[0].reject(new Error("offline"));
  await completion;
  tree = render();
  assert.equal(find(tree, (n) => n.type === "button").props.disabled, false);
  assert.ok(find(tree, (n) => n.props.role === "alert"));
  completion = find(tree, (n) => n.type === "button").props.onClick();
  signIns[1].resolve({ success: true });
  await completion;
  assert.deepEqual(routes, ["/my-submission"]);
});

test("heatmap exposes named grid cells, roving keyboard focus, and Enter/Space drilldown", async () => {
  const h = hooks(),
    pairs = [];
  const entities = ["AAA", "BBB", "CCC"].map((code) => ({
    code,
    label: code,
    section: "other",
  }));
  const { HeatmapMatrix } = load("src/app/analysis/heatmap/HeatmapMatrix.tsx", {
    react: h.react,
    "lucide-react": new Proxy({}, { get: () => function Icon() {} }),
    "@/features/mandates/heatmap/matrix-utils": {
      pairKey: (a, b) => [a, b].sort().join(":"),
    },
    "@/features/mandates/actions/heatmap": {
      fetchPairMandates: async (a, b) => {
        pairs.push([a, b]);
        return [];
      },
    },
    "@/features/mandates/heatmap/entity-sections": {
      CURATED_ENTITIES: entities,
      CURATED_CODES: entities.map((e) => e.code),
      SECTION_ORDER: ["other"],
      SECTION_META: { other: { label: "Other", baseColor: "#333333" } },
      CROSS_SECTION_COLOR: "#333333",
      getCuratedEntity: (code) => entities.find((e) => e.code === code),
    },
    "@/features/mandates/heatmap/color-scale": {
      sequentialColor: () => "#fff",
      divergingColor: () => "#fff",
      tint: () => "#fff",
      DEFAULT_REDUCED_COLOR: "#000",
      DEFAULT_GREW_COLOR: "#fff",
    },
    "@/features/mandates/heatmap/heatmap-svg": {},
    "@/components/Tooltip": { Tooltip: "Tooltip" },
  });
  const matrix = {
    entities: entities.map((e) => e.code),
    pairs: { "AAA:BBB": 3 },
  };
  const layers = Object.fromEntries(
    ["v2026", "v2027", "delta", "projected", "projectedDelta"].map((id) => [
      id,
      matrix,
    ]),
  );
  const render = () => h.render(() => HeatmapMatrix({ layers }));
  let tree = render();
  const grid = find(tree, (n) => n.props.role === "grid");
  assert.ok(grid.props["aria-label"]);
  let target;
  grid.props.ref.current = {
    querySelector(selector) {
      return {
        focus() {
          target = selector;
        },
      };
    },
  };
  const cell = find(
    tree,
    (n) => n.props.role === "gridcell" && n.props.tabIndex === 0,
  );
  assert.match(cell.props["aria-label"], /AAA and BBB: 3/);
  const key = (key) => ({ key, preventDefault() {} });
  cell.props.onKeyDown(key("ArrowRight"));
  assert.equal(target, '[data-row="0"][data-col="2"]');
  cell.props.onKeyDown(key("ArrowUp"));
  assert.equal(target, '[data-row="0"][data-col="1"]');
  cell.props.onKeyDown(key("Enter"));
  cell.props.onKeyDown(key(" "));
  await settle();
  assert.deepEqual(pairs, [
    ["AAA", "BBB"],
    ["AAA", "BBB"],
  ]);
  cell.props.onFocus();
  tree = render();
  assert.equal(
    find(tree, (n) => n.props.role === "gridcell" && n.props.tabIndex === 0)
      .props["data-col"],
    1,
  );
});

test("tooltip describes interactive children on focus and dismisses with Escape", () => {
  const h = hooks();
  const { Tooltip } = load(
    "src/components/Tooltip.tsx",
    {
      react: h.react,
      "react-dom": { createPortal: (node) => node },
      "@radix-ui/react-slot": { Slot: "slot" },
      "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
      "@/lib/theme": { POPUP_STYLES: { tooltipSize: "max-w-xs" } },
    },
    {
      window: {
        innerWidth: 1000,
        addEventListener() {},
        removeEventListener() {},
      },
      document: { activeElement: null, body: {} },
    },
  );
  const props = {
    content: "More detail",
    children: React.createElement("button", null, "Info"),
  };
  const render = () => h.render(() => Tooltip(props));
  let tree = render();
  const trigger = () =>
    find(
      tree,
      (node) =>
        node.type === "span" && typeof node.props.onFocus === "function",
    );
  assert.equal(
    trigger().props.tabIndex,
    undefined,
    "avoid an extra tab stop around an interactive child",
  );
  trigger().props.ref({
    getBoundingClientRect: () => ({
      top: 100,
      bottom: 120,
      left: 100,
      width: 40,
    }),
  });
  trigger().props.onFocus({ defaultPrevented: false });
  tree = render();
  const tooltip = find(tree, (node) => node.props.role === "tooltip");
  assert.ok(tooltip);
  assert.equal(
    find(tree, (node) => node.type === "button").props["aria-describedby"],
    tooltip.props.id,
  );
  let stopped = false;
  trigger().props.onKeyDown({
    key: "Escape",
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  assert.equal(
    find(render(), (node) => node.props.role === "tooltip"),
    undefined,
  );
});

test("sign-in destination follows reviewer access rather than selected entity", () => {
  const navigation = load("src/features/auth/navigation.ts", {});
  assert.equal(
    navigation.getSignInDestination({ isReviewer: true, entity: "DESA" }),
    "/",
  );
  assert.equal(
    navigation.getSignInDestination({ isReviewer: false, entity: null }),
    "/my-submission",
  );
});

test("primary navigation handles trailing slashes, encoded entities and reviewer context", () => {
  const navigation = load("src/features/auth/navigation.ts", {});
  let pathname = "/entity/Entity%20%2F%20Office/";
  const Link = () => null;
  const { PrimaryNavigation } = load(
    "src/components/core/PrimaryNavigation.tsx",
    {
      "next/link": { default: Link },
      "next/navigation": { usePathname: () => pathname },
      "@/features/auth/navigation": navigation,
      "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    },
  );
  const props = { entity: "Entity / Office", isReviewer: false };
  let items = PrimaryNavigation(props).props.children;
  assert.deepEqual(
    items.map((item) => item.props.children),
    ["Overview", "My submission"],
  );
  assert.equal(items[1].props["aria-current"], "page");
  assert.equal(items[0].props["aria-current"], undefined);
  pathname = "/my-submission/";
  items = PrimaryNavigation({ ...props, entity: null }).props.children;
  assert.equal(items[1].props["aria-current"], "page");
  items = PrimaryNavigation({ ...props, isReviewer: true }).props.children;
  assert.deepEqual(
    items.map((item) => item.props.children),
    ["Overview", "Analysis"],
  );
  pathname = "/entity/DESA/";
  items = PrimaryNavigation({ ...props, isReviewer: true }).props.children;
  assert.equal(items[0].props["aria-current"], "page");
});

test("My submission resolves known entities and handles missing workspaces without a 404", async () => {
  let user = { entity: "Entity / Office", isReviewer: false };
  let reads = 0;
  const MissingSubmission = () => null;
  const { default: MySubmissionPage } = load("src/app/my-submission/page.tsx", {
    "next/navigation": {
      redirect: (path) => {
        throw new Error(`redirect:${path}`);
      },
    },
    "@/features/auth/auth": { getCurrentUser: async () => user },
    "@/features/mandates/services/data-service": {
      fetchEntities: async () => {
        reads++;
        return [{ entity: "Entity / Office", entity_long: null }];
      },
    },
    "@/components/core/Header": { Header() {} },
    "@/features/auth/ui/MissingSubmission": { MissingSubmission },
    "@/features/mandates/ui/SubmissionCycleControl": {
      SubmissionCycleControl() {},
    },
  });
  await assert.rejects(MySubmissionPage(), {
    message: "redirect:/entity/Entity%20%2F%20Office",
  });
  user = { entity: null, isReviewer: false };
  let tree = await MySubmissionPage();
  assert.equal(
    find(tree, (node) => node.type === MissingSubmission).props.entity,
    null,
  );
  user = { entity: "Unavailable", isReviewer: false };
  tree = await MySubmissionPage();
  assert.equal(
    find(tree, (node) => node.type === MissingSubmission).props.entity,
    "Unavailable",
  );
  const previousReads = reads;
  user = { entity: "Entity / Office", isReviewer: true };
  await assert.rejects(MySubmissionPage(), { message: "redirect:/" });
  assert.equal(reads, previousReads);
  user = null;
  await assert.rejects(MySubmissionPage(), { message: "redirect:/login" });
});
