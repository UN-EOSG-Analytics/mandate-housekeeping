"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { Download, X, ExternalLink, ImageDown, RotateCcw } from "lucide-react";
import {
  pairKey,
  type MatrixData,
} from "@/features/mandates/heatmap/matrix-utils";
import {
  fetchPairMandates,
  type SharedMandate,
} from "@/features/mandates/actions/heatmap";
import {
  CURATED_ENTITIES,
  CURATED_CODES,
  SECTION_META,
  SECTION_ORDER,
  CROSS_SECTION_COLOR,
  getCuratedEntity,
  type Section,
} from "@/features/mandates/heatmap/entity-sections";
import {
  sequentialColor,
  divergingColor,
  tint,
  DEFAULT_REDUCED_COLOR,
  DEFAULT_GREW_COLOR,
} from "@/features/mandates/heatmap/color-scale";
import { buildHeatmapSvg } from "@/features/mandates/heatmap/heatmap-svg";

const DEFAULT_COLORS: Record<string, string> = {
  cross: CROSS_SECTION_COLOR,
  reduced: DEFAULT_REDUCED_COLOR,
  grew: DEFAULT_GREW_COLOR,
  ...Object.fromEntries(
    SECTION_ORDER.map((s) => [s, SECTION_META[s].baseColor]),
  ),
};

export type LayerId =
  | "v2026"
  | "v2027"
  | "delta"
  | "projected"
  | "projectedDelta";

interface LayerDef {
  id: LayerId;
  label: string;
  kind: "sequential" | "diverging";
  description: string;
}

const LAYERS: LayerDef[] = [
  {
    id: "v2026",
    label: "2026",
    kind: "sequential",
    description: "Shared mandates per entity pair in the PPB 2026 source data.",
  },
  {
    id: "v2027",
    label: "2027",
    kind: "sequential",
    description: "Shared mandates per entity pair in the PPB 2027 fascicle.",
  },
  {
    id: "delta",
    label: "Δ 2027 − 2026",
    kind: "diverging",
    description:
      "Change from 2026 to 2027. Green = overlap reduced (cleaner), red = overlap grew.",
  },
  {
    id: "projected",
    label: "After decisions",
    kind: "sequential",
    description:
      "2026 source data after applying current review decisions, with entity submissions as fallback (remove/add).",
  },
  {
    id: "projectedDelta",
    label: "Δ decisions",
    kind: "diverging",
    description:
      "Impact of housekeeping decisions on 2026 overlap. Green = reduced, red = increased.",
  },
];

export interface HeatmapPayload {
  layers: Record<LayerId, MatrixData>;
}

interface OrderedEntity {
  code: string;
  label: string;
  section: Section;
}

const CELL = 18;
const COLHEAD_H = 62; // top label gutter height
const LABEL_W = COLHEAD_H; // left label gutter width — kept equal to the header height

export function HeatmapMatrix({ layers }: HeatmapPayload) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridHelpId = useId();
  const [focusedCell, setFocusedCell] = useState("");
  const [layerId, setLayerId] = useState<LayerId>("v2026");
  const [hover, setHover] = useState<{
    a: OrderedEntity;
    b: OrderedEntity;
    value: number;
  } | null>(null);
  const [selected, setSelected] = useState<{
    a: OrderedEntity;
    b: OrderedEntity;
  } | null>(null);
  const [mandates, setMandates] = useState<SharedMandate[]>([]);
  const [isPending, startTransition] = useTransition();

  // Appearance: editable section colours, scale gamma, and normalization mode.
  const [colors, setColors] = useState<Record<string, string>>(DEFAULT_COLORS);
  const [gamma, setGamma] = useState(0.5);
  const [scaleMode, setScaleMode] = useState<"section" | "global">("section");

  const colorFor = (s: Section) => colors[s] ?? SECTION_META[s].baseColor;
  const crossColor = colors.cross ?? CROSS_SECTION_COLOR;
  const tintFor = (s: Section) =>
    s === "other" ? tint(crossColor) : tint(colorFor(s));

  function selectPair(a: OrderedEntity, b: OrderedEntity) {
    setSelected({ a, b });
    startTransition(async () => {
      setMandates(await fetchPairMandates(a.code, b.code));
    });
  }

  const layer = LAYERS.find((l) => l.id === layerId)!;
  const matrix = layers[layerId];
  const isDiff = layer.kind === "diverging";

  // Full ordered universe: every entity cited in any layer, plus the curated
  // 41, ordered by section then curated order then alpha.
  const universe = useMemo<OrderedEntity[]>(() => {
    const codes = new Set<string>(CURATED_CODES);
    for (const id of Object.keys(layers) as LayerId[]) {
      for (const c of layers[id].entities) codes.add(c);
    }
    const curatedIndex = new Map(
      CURATED_ENTITIES.map((e, i) => [e.code, i] as const),
    );
    return [...codes]
      .map<OrderedEntity>((code) => {
        const cur = getCuratedEntity(code);
        return cur
          ? { code, label: cur.label, section: cur.section }
          : { code, label: code, section: "other" };
      })
      .sort((x, y) => {
        const sx = SECTION_ORDER.indexOf(x.section);
        const sy = SECTION_ORDER.indexOf(y.section);
        if (sx !== sy) return sx - sy;
        const cx = curatedIndex.get(x.code) ?? Infinity;
        const cy = curatedIndex.get(y.code) ?? Infinity;
        if (cx !== cy) return cx - cy;
        return x.code.localeCompare(y.code);
      });
  }, [layers]);

  // Entities with at least one citation in the 2027 draft.
  const present2027 = useMemo(() => new Set(layers.v2027.entities), [layers]);

  // Selected entity codes (default = the curated figure). Presets set this;
  // the entity list toggles individual members.
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    () => new Set(CURATED_CODES),
  );

  const entities = useMemo(
    () => universe.filter((e) => selectedEntities.has(e.code)),
    [universe, selectedEntities],
  );

  const entityPresets = [
    {
      id: "figure",
      label: `Figure (${CURATED_CODES.length})`,
      codes: CURATED_CODES,
    },
    {
      id: "in2027",
      label: `In 2027 draft (${present2027.size})`,
      codes: [...present2027],
    },
    {
      id: "all",
      label: `All (${universe.length})`,
      codes: universe.map((e) => e.code),
    },
  ];

  // Scale reference. Diverging layers use a single max-abs (cross-block
  // comparable). Sequential layers normalize PER colour group — each section
  // block against its own max, cross-section greys against theirs — so the
  // smaller clusters stay vivid instead of being washed out by Development's
  // large counts (matches the figure's per-block saturation).
  const scaleRef = useMemo(() => {
    if (isDiff) {
      let maxAbs = 0;
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const v =
            matrix.pairs[pairKey(entities[i].code, entities[j].code)] ?? 0;
          maxAbs = Math.max(maxAbs, Math.abs(v));
        }
      }
      return {
        maxAbs,
        perSection: {} as Record<string, number>,
        cross: 0,
        global: 0,
      };
    }
    const perSection: Record<string, number> = {};
    let cross = 0;
    let global = 0;
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const v = matrix.pairs[pairKey(a.code, b.code)] ?? 0;
        global = Math.max(global, v);
        if (a.section === b.section && a.section !== "other") {
          perSection[a.section] = Math.max(perSection[a.section] ?? 0, v);
        } else {
          cross = Math.max(cross, v);
        }
      }
    }
    return { maxAbs: 0, perSection, cross, global };
  }, [entities, matrix, isDiff]);

  // Contiguous section runs for the band header.
  const bands = useMemo(() => {
    const runs: { section: Section; count: number }[] = [];
    for (const e of entities) {
      const last = runs[runs.length - 1];
      if (last && last.section === e.section) last.count++;
      else runs.push({ section: e.section, count: 1 });
    }
    return runs;
  }, [entities]);

  const reducedColor = colors.reduced ?? DEFAULT_REDUCED_COLOR;
  const grewColor = colors.grew ?? DEFAULT_GREW_COLOR;

  function cellColor(a: OrderedEntity, b: OrderedEntity, value: number) {
    if (isDiff)
      return divergingColor(
        value,
        scaleRef.maxAbs,
        gamma,
        reducedColor,
        grewColor,
      );
    const sameSection = a.section === b.section && a.section !== "other";
    const base = sameSection ? colorFor(a.section) : crossColor;
    const max =
      scaleMode === "global"
        ? scaleRef.global
        : sameSection
          ? (scaleRef.perSection[a.section] ?? 0)
          : scaleRef.cross;
    return sequentialColor(value, max, base, gamma);
  }

  function exportSvg() {
    const svg = buildHeatmapSvg({
      entities,
      bands,
      matrix,
      cellColor,
      tintFor,
      bandColor: (s) => (s === "other" ? crossColor : colorFor(s)),
      bandLabel: (s) => SECTION_META[s].label,
      legend: legendItems,
      title: `Overlapping mandate citations — ${layer.label}`,
    });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cocitation_${layerId}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const legendItems = isDiff
    ? [
        { color: reducedColor, label: "Overlap reduced" },
        { color: grewColor, label: "Overlap grew" },
      ]
    : [
        ...SECTION_ORDER.filter((s) => bands.some((b) => b.section === s)).map(
          (s) => ({
            color: s === "other" ? crossColor : colorFor(s),
            label: SECTION_META[s].label,
          }),
        ),
        { color: crossColor, label: "Cross-section" },
      ];

  const focusedCellVisible = entities.some((r) =>
    entities.some((c) => `${r.code}:${c.code}` === focusedCell),
  );

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-200">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLayerId(l.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                l.id === layerId
                  ? "bg-un-blue text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Entities:</span>
          {entityPresets.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedEntities(new Set(p.codes))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={exportSvg}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
        >
          <ImageDown className="h-3.5 w-3.5" />
          Export SVG
        </button>
        <a
          href="/api/export/heatmap"
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
        >
          <Download className="h-3.5 w-3.5" />
          Export Excel
        </a>
      </div>

      <p className="mb-3 max-w-3xl text-sm text-gray-500">
        {layer.description}
      </p>

      {/* Entity selector */}
      <details className="mb-3 rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-700">
          Select entities — {entities.length} shown
        </summary>
        <div className="border-t border-gray-100 p-4">
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-un-blue">
            <button
              onClick={() =>
                setSelectedEntities(new Set(universe.map((e) => e.code)))
              }
            >
              Select all
            </button>
            <button onClick={() => setSelectedEntities(new Set())}>
              Clear
            </button>
            <button
              onClick={() =>
                setSelectedEntities(
                  (prev) =>
                    new Set([...prev].filter((c) => present2027.has(c))),
                )
              }
            >
              Keep only entities with 2027 data
            </button>
          </div>
          <div className="space-y-3">
            {SECTION_ORDER.filter((s) =>
              universe.some((e) => e.section === s),
            ).map((s) => (
              <div key={s}>
                <p
                  className="mb-1 text-[11px] font-semibold"
                  style={{ color: s === "other" ? crossColor : colorFor(s) }}
                >
                  {SECTION_META[s].label}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
                  {universe
                    .filter((e) => e.section === s)
                    .map((e) => {
                      const has2027 = present2027.has(e.code);
                      return (
                        <label
                          key={e.code}
                          className={`flex cursor-pointer items-center gap-1.5 text-xs ${
                            has2027 ? "text-gray-700" : "text-gray-400"
                          }`}
                          title={
                            has2027 ? e.code : `${e.code} — no 2027 data yet`
                          }
                        >
                          <input
                            type="checkbox"
                            checked={selectedEntities.has(e.code)}
                            onChange={() =>
                              setSelectedEntities((prev) => {
                                const next = new Set(prev);
                                if (next.has(e.code)) next.delete(e.code);
                                else next.add(e.code);
                                return next;
                              })
                            }
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate">{e.label}</span>
                          {!has2027 && (
                            <span className="shrink-0 text-[9px] text-gray-300">
                              no 27
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Hover status bar */}
      <div className="mb-2 h-5 text-xs text-gray-600">
        {hover ? (
          <span>
            <span className="font-medium text-gray-900">{hover.a.label}</span>
            {" ↔ "}
            <span className="font-medium text-gray-900">{hover.b.label}</span>
            {" — "}
            {isDiff
              ? `${hover.value > 0 ? "+" : ""}${hover.value} change`
              : `${hover.value} shared mandate${hover.value === 1 ? "" : "s"}`}
          </span>
        ) : (
          <span className="text-gray-400">
            Hover or focus a cell for details
          </span>
        )}
      </div>

      <p id={gridHelpId} className="sr-only">
        Use arrow keys to move between entity pairs. Press Enter or Space to
        show shared mandates.
      </p>
      <div className="flex items-start gap-4">
        {/* Matrix */}
        <div className="min-w-0 flex-1 overflow-x-auto pb-4">
          <div className="inline-block select-none">
            {/* Section bands — coloured underline spans the section's columns;
              the centred label is allowed to overflow (never truncated), like
              the PDF, without pushing neighbouring bands. */}
            <div
              className="relative flex items-end"
              style={{ marginLeft: LABEL_W, height: 30 }}
            >
              {bands.map((b, i) => {
                const bc =
                  b.section === "other" ? crossColor : colorFor(b.section);
                return (
                  <div
                    key={i}
                    className="relative h-full"
                    style={{ width: b.count * CELL }}
                  >
                    {/* Label constrained to the band width: multi-word labels wrap
                      (e.g. Humanitarian → two lines); short un-wrappable ones
                      (H/R, Legal) overflow centred into empty space. */}
                    <span
                      className="absolute bottom-1 left-0 w-full text-center text-[11px] leading-[1.05] font-semibold"
                      style={{ color: bc, hyphens: "manual" }}
                    >
                      {SECTION_META[b.section].label}
                    </span>
                    <div
                      className="absolute bottom-0 left-0 w-full border-b-2"
                      style={{ borderColor: bc }}
                    />
                  </div>
                );
              })}
            </div>

            <div
              ref={gridRef}
              role="grid"
              aria-label={`${layer.label} shared mandates by entity pair`}
              aria-describedby={gridHelpId}
              aria-rowcount={entities.length + 1}
              aria-colcount={entities.length + 1}
            >
              {/* Column labels */}
              <div role="row" className="flex items-end">
                <div
                  role="columnheader"
                  className="flex items-end justify-start pr-1 text-[10px] font-semibold text-gray-500"
                  style={{ width: LABEL_W, height: COLHEAD_H }}
                >
                  Cross-citation
                </div>
                {entities.map((e) => (
                  <div
                    key={e.code}
                    role="columnheader"
                    className="flex items-end justify-center"
                    style={{
                      width: CELL,
                      height: COLHEAD_H,
                      backgroundColor: tintFor(e.section),
                      borderRight: "1px solid rgba(255,255,255,0.7)",
                    }}
                  >
                    <span
                      className="py-1 text-[10px] text-gray-700"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                      }}
                    >
                      {e.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {entities.map((rowE, rowIndex) => (
                <div key={rowE.code} role="row" className="flex items-center">
                  <div
                    role="rowheader"
                    className="truncate px-1 text-right text-[10px] leading-4.5 text-gray-700"
                    style={{
                      width: LABEL_W,
                      height: CELL,
                      backgroundColor: tintFor(rowE.section),
                      borderBottom: "1px solid rgba(255,255,255,0.7)",
                    }}
                    title={rowE.code}
                  >
                    {rowE.label}
                  </div>
                  {entities.map((colE, colIndex) => {
                    const isDiagonal = rowE.code === colE.code;
                    const value = isDiagonal
                      ? 0
                      : (matrix.pairs[pairKey(rowE.code, colE.code)] ?? 0);
                    const bg = isDiagonal ? null : cellColor(rowE, colE, value);
                    const isSelected =
                      !!selected &&
                      !isDiagonal &&
                      ((selected.a.code === rowE.code &&
                        selected.b.code === colE.code) ||
                        (selected.a.code === colE.code &&
                          selected.b.code === rowE.code));
                    return (
                      <div
                        key={colE.code}
                        role="gridcell"
                        data-row={rowIndex}
                        data-col={colIndex}
                        aria-selected={isSelected}
                        aria-label={
                          isDiagonal
                            ? `${rowE.label}: same entity`
                            : `${rowE.label} and ${colE.label}: ${value} ${isDiff ? "change in shared mandates" : "shared mandates"}. Show mandates`
                        }
                        tabIndex={
                          focusedCell === `${rowE.code}:${colE.code}` ||
                          (!focusedCellVisible &&
                            rowIndex === 0 &&
                            colIndex === (entities.length > 1 ? 1 : 0))
                            ? 0
                            : -1
                        }
                        className="focus-visible:z-10 focus-visible:!outline-2 focus-visible:!outline-offset-1 focus-visible:!outline-un-blue"
                        onFocus={() => {
                          setFocusedCell(`${rowE.code}:${colE.code}`);
                          setHover({ a: rowE, b: colE, value });
                        }}
                        onKeyDown={(event) => {
                          if (
                            (event.key === "Enter" || event.key === " ") &&
                            !isDiagonal
                          ) {
                            event.preventDefault();
                            selectPair(rowE, colE);
                            return;
                          }
                          let nextRow = rowIndex;
                          let nextCol = colIndex;
                          switch (event.key) {
                            case "ArrowDown":
                              nextRow += 1;
                              break;
                            case "ArrowUp":
                              nextRow -= 1;
                              break;
                            case "ArrowRight":
                              nextCol += 1;
                              break;
                            case "ArrowLeft":
                              nextCol -= 1;
                              break;
                            case "Home":
                              nextCol = 0;
                              break;
                            case "End":
                              nextCol = entities.length - 1;
                              break;
                            default:
                              return;
                          }
                          event.preventDefault();
                          nextRow = Math.max(
                            0,
                            Math.min(entities.length - 1, nextRow),
                          );
                          nextCol = Math.max(
                            0,
                            Math.min(entities.length - 1, nextCol),
                          );
                          gridRef.current
                            ?.querySelector<HTMLElement>(
                              `[data-row="${nextRow}"][data-col="${nextCol}"]`,
                            )
                            ?.focus();
                        }}
                        onMouseEnter={() =>
                          !isDiagonal && setHover({ a: rowE, b: colE, value })
                        }
                        onClick={() => !isDiagonal && selectPair(rowE, colE)}
                        title={
                          isDiagonal
                            ? rowE.label
                            : `${rowE.label} ↔ ${colE.label}: ${value}`
                        }
                        style={{
                          width: CELL,
                          height: CELL,
                          backgroundColor:
                            bg ?? (isDiagonal ? "#f9fafb" : "#fff"),
                          outline: isSelected
                            ? "2px solid #111827"
                            : "0.5px solid rgba(0,0,0,0.04)",
                          outlineOffset: isSelected ? "-1px" : undefined,
                          cursor: isDiagonal ? "default" : "pointer",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail panel — cross-cited mandates for the clicked cell */}
        <DetailPanel
          selected={selected}
          mandates={mandates}
          loading={isPending}
          onClose={() => setSelected(null)}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-gray-600">
        {legendItems.map((it) => (
          <LegendSwatch key={it.label} color={it.color} label={it.label} />
        ))}
        <span className="text-gray-400">
          Intensity ={" "}
          {isDiff ? "magnitude of change" : "number of shared mandates"}
        </span>
      </div>

      {/* Appearance controls */}
      <details className="mt-4 rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-700">
          Appearance — colours &amp; scaling
        </summary>
        <div className="space-y-4 border-t border-gray-100 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Section colours
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {[...SECTION_ORDER, "cross" as const].map((key) => (
                <ColorField
                  key={key}
                  label={
                    key === "cross"
                      ? "Cross-section"
                      : SECTION_META[key as Section].label
                  }
                  value={colors[key] ?? "#000000"}
                  onChange={(v) => setColors((c) => ({ ...c, [key]: v }))}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Difference layers (Δ)
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              <ColorField
                label="Overlap reduced"
                value={reducedColor}
                onChange={(v) => setColors((c) => ({ ...c, reduced: v }))}
              />
              <ColorField
                label="Overlap grew"
                value={grewColor}
                onChange={(v) => setColors((c) => ({ ...c, grew: v }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-500">
                Intensity (gamma)
              </span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={gamma}
                onChange={(e) => setGamma(parseFloat(e.target.value))}
              />
              <span className="w-8 font-mono text-[11px]">
                {gamma.toFixed(2)}
              </span>
              <span className="text-gray-400">lower = more saturated</span>
            </label>

            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-500">Scale</span>
              {(["section", "global"] as const).map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-1"
                >
                  <input
                    type="radio"
                    name="scaleMode"
                    checked={scaleMode === m}
                    onChange={() => setScaleMode(m)}
                  />
                  {m === "section" ? "Per section" : "Global"}
                </label>
              ))}
            </div>

            <button
              onClick={() => {
                setColors(DEFAULT_COLORS);
                setGamma(0.5);
                setScaleMode("section");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

function DetailPanel({
  selected,
  mandates,
  loading,
  onClose,
}: {
  selected: { a: OrderedEntity; b: OrderedEntity } | null;
  mandates: SharedMandate[];
  loading: boolean;
  onClose: () => void;
}) {
  const n2026 = mandates.filter((m) => m.in2026).length;
  const n2027 = mandates.filter((m) => m.in2027).length;

  return (
    <aside className="sticky top-4 w-96 shrink-0 self-start rounded-lg border border-gray-200 bg-white">
      {!selected ? (
        <div className="p-4 text-sm text-gray-400">
          Click any cell to list the mandates cross-cited by the two entities.
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 border-b border-gray-100 p-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selected.a.label} <span className="text-gray-400">↔</span>{" "}
                {selected.b.label}
              </p>
              {!loading && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {mandates.length} cross-cited · {n2026} in 2026 · {n2027} in
                  2027
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] scrollbar-thin overflow-y-auto p-2">
            {loading ? (
              <p className="p-2 text-sm text-gray-400">Loading…</p>
            ) : mandates.length === 0 ? (
              <p className="p-2 text-sm text-gray-400">No shared mandates.</p>
            ) : (
              <ul className="space-y-0.5">
                {mandates.map((m) => (
                  <MandateItem key={m.symbol} m={m} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function MandateItem({ m }: { m: SharedMandate }) {
  return (
    <li className="rounded px-2 py-1.5 hover:bg-gray-50">
      <div className="flex items-center gap-1.5">
        {m.link ? (
          <a
            href={m.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-un-blue hover:underline"
          >
            {m.symbol}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs font-medium text-gray-900">{m.symbol}</span>
        )}
        {m.year && <span className="text-[10px] text-gray-400">{m.year}</span>}
        <span className="ml-auto flex gap-1">
          {m.in2026 && <VersionPill label="26" color="#009edb" />}
          {m.in2027 && <VersionPill label="27" color="#6c5b7b" />}
        </span>
      </div>
      {m.title && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-500">
          {m.title}
        </p>
      )}
    </li>
  );
}

function VersionPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded px-1 text-[10px] leading-4 font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-gray-200"
        aria-label={label}
      />
      <span className="w-24 truncate text-xs text-gray-600">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
            onChange(e.target.value);
        }}
        className="w-20 rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[11px] text-gray-700"
      />
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
