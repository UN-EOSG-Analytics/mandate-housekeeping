// Run the real manual form against controlled catalogue states, without a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync("src/features/mandates/ui/ManualDocumentForm.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node)
    ? [node, ...nodes(node.props.children)]
    : [];
}
function form(props = {}, searchState = { results: [], searching: false }) {
  const slots = [],
    submissions = [],
    selections = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useEffect() {},
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
  };
  const dependencies = {
    react: hooks,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "lucide-react": { Info() {}, X() {}, ArrowLeftFromLine() {} },
    "@/lib/constants": { MIN_YEAR: 1946, MAX_YEAR: 2026 },
    "../../../components/Tooltip": { Tooltip() {} },
    "@/features/mandates/services/reference-data": {
      getIssuingBodies: async () => [],
    },
    "@/hooks/useDocumentSearch": { useDocumentSearch: () => searchState },
  };
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    assert.ok(
      Object.hasOwn(dependencies, name),
      `Unexpected dependency: ${name}`,
    );
    return dependencies[name];
  });
  const render = () => {
    cursor = 0;
    return nodes(
      exports.ManualDocumentForm({
        onSubmit: (data) => submissions.push(data),
        onSelect: (symbol) => selections.push(symbol),
        onCancel() {},
        ...props,
      }),
    );
  };
  return {
    submissions,
    selections,
    button(label = "Add") {
      return render().find(
        (node) => node.type === "button" && node.props.children === label,
      );
    },
    field(name, value) {
      const inputs = render().filter((node) => node.type === "input");
      const node =
        name === "other"
          ? inputs.find(
              (input) =>
                input.props.placeholder ===
                "Enter the name of the issuing body",
            )
          : name === "year"
            ? inputs.find((input) => input.props.inputMode === "numeric")
            : name === "link"
              ? inputs.find((input) => input.props.type === "url")
              : inputs[{ symbol: 0, title: 1, body: 2 }[name]];
      node.props.onChange({ target: { value } });
    },
  };
}
function fill(h) {
  for (const [name, value] of Object.entries({
    symbol: "UN Charter",
    title: "test",
    body: "Other",
    other: "bup",
    year: "1946",
    link: "https://example.com",
  }))
    h.field(name, value);
}
test("the screenshot's valid manual entry can be submitted while the catalogue search is pending", () => {
  const h = form({}, { results: [], searching: true });
  fill(h);
  assert.equal(h.button().props.disabled, false);
  h.button().props.onClick();
  assert.deepEqual(h.submissions, [
    {
      symbol: "UN Charter",
      title: "test",
      body: "bup",
      year: "1946",
      link: "https://example.com",
    },
  ]);
});
test("a matching catalogue symbol does not block corrected manual metadata", () => {
  const h = form(
    {
      initialSymbol: "UN Charter",
      initialTitle: "old",
      initialBody: "GA",
      initialYear: "1946",
      initialLink: "https://example.com",
      submitLabel: "Save details",
    },
    {
      results: [{ symbol: "UN CHARTER", title: "Catalogue title" }],
      searching: false,
    },
  );
  h.field("title", "Corrected title");
  assert.equal(h.button("Save details").props.disabled, false);
  h.button("Save details").props.onClick();
  assert.equal(h.submissions[0].title, "Corrected title");
});
test("using an existing document is a separate explicit choice", () => {
  const h = form(
    {},
    {
      results: [{ symbol: "UN CHARTER", title: "Catalogue title" }],
      searching: false,
    },
  );
  fill(h);
  h.button("Use existing document").props.onClick();
  assert.deepEqual(h.selections, ["UN CHARTER"]);
  assert.equal(h.submissions.length, 0);
});
test("a catalogue error does not block otherwise valid manual data", () => {
  const h = form({}, { results: [], searching: false, searchError: true });
  fill(h);
  assert.equal(h.button().props.disabled, false);
});
test("required fields and invalid URLs or years still prevent submission", () => {
  for (const [name, value] of [
    ["title", ""],
    ["other", ""],
    ["link", "not a URL"],
    ["year", "19"],
  ]) {
    const h = form();
    fill(h);
    h.field(name, value);
    assert.equal(h.button().props.disabled, true);
    h.button().props.onClick();
    assert.equal(h.submissions.length, 0);
  }
});
