/**
 * Pure SVG renderer for the co-citation heatmap — a clean static figure
 * (section bands, tinted labels, cells, legend) mirroring the on-screen matrix.
 * Receives the same colour/scale functions the component uses so the export
 * matches exactly. No React, no DOM — returns an SVG string.
 */

import { pairKey, type MatrixData } from "./matrix-utils";
import type { Section } from "./entity-sections";

export interface SvgEntity {
  code: string;
  label: string;
  section: Section;
}

interface BuildArgs {
  entities: SvgEntity[];
  bands: { section: Section; count: number }[];
  matrix: MatrixData;
  cellColor: (a: SvgEntity, b: SvgEntity, value: number) => string | null;
  tintFor: (s: Section) => string;
  bandColor: (s: Section) => string;
  bandLabel: (s: Section) => string;
  legend: { color: string; label: string }[];
  title: string;
}

const CELL = 18;
const LABEL_W = 62;
const COLHEAD_H = 62;
const BAND_H = 30;
const PAD = 12;
const TITLE_H = 24;
const LEGEND_H = 28;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildHeatmapSvg(args: BuildArgs): string {
  const { entities, bands, matrix } = args;
  const n = entities.length;

  const matrixX = PAD + LABEL_W;
  const bandTop = PAD + TITLE_H;
  const bandBottom = bandTop + BAND_H;
  const colTop = bandBottom;
  const gridTop = colTop + COLHEAD_H;
  const gridW = n * CELL;
  const gridH = n * CELL;
  const gridBottom = gridTop + gridH;
  const width = matrixX + gridW + PAD;
  const height = gridBottom + 16 + LEGEND_H + PAD;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // Title
  parts.push(
    `<text x="${PAD}" y="${PAD + 14}" font-size="14" font-weight="700" fill="#111827">${esc(args.title)}</text>`,
  );

  // Section bands
  let col = 0;
  for (const b of bands) {
    const x = matrixX + col * CELL;
    const w = b.count * CELL;
    const cx = x + w / 2;
    const color = args.bandColor(b.section);
    parts.push(
      `<line x1="${x}" y1="${bandBottom}" x2="${x + w}" y2="${bandBottom}" stroke="${color}" stroke-width="2"/>`,
    );
    const label = args.bandLabel(b.section);
    const lines = label.split(/­/); // soft hyphen → two lines (Humanitarian)
    if (lines.length === 2) {
      parts.push(
        `<text x="${cx}" y="${bandBottom - 15}" font-size="11" font-weight="600" text-anchor="middle" fill="#374151">${esc(lines[0])}-</text>`,
        `<text x="${cx}" y="${bandBottom - 4}" font-size="11" font-weight="600" text-anchor="middle" fill="#374151">${esc(lines[1])}</text>`,
      );
    } else {
      parts.push(
        `<text x="${cx}" y="${bandBottom - 5}" font-size="11" font-weight="600" text-anchor="middle" fill="#374151">${esc(label)}</text>`,
      );
    }
    col += b.count;
  }

  // Corner label
  parts.push(
    `<text x="${PAD}" y="${gridTop - 4}" font-size="9" font-weight="600" fill="#374151">Cross-citation</text>`,
  );

  // Column headers: tint backgrounds + rotated labels
  entities.forEach((e, j) => {
    const x = matrixX + j * CELL;
    parts.push(
      `<rect x="${x}" y="${colTop}" width="${CELL}" height="${COLHEAD_H}" fill="${args.tintFor(e.section)}" stroke="#ffffff" stroke-width="0.5"/>`,
    );
    const cx = x + CELL / 2;
    const by = gridTop - 4;
    parts.push(
      `<text x="${cx}" y="${by}" font-size="9" fill="#374151" text-anchor="start" transform="rotate(-90 ${cx} ${by})">${esc(e.label)}</text>`,
    );
  });

  // Rows: tint label + cells
  entities.forEach((rowE, i) => {
    const y = gridTop + i * CELL;
    parts.push(
      `<rect x="${PAD}" y="${y}" width="${LABEL_W}" height="${CELL}" fill="${args.tintFor(rowE.section)}" stroke="#ffffff" stroke-width="0.5"/>`,
      `<text x="${PAD + LABEL_W - 4}" y="${y + CELL / 2 + 3}" font-size="9" fill="#374151" text-anchor="end">${esc(rowE.label)}</text>`,
    );
    entities.forEach((colE, j) => {
      const x = matrixX + j * CELL;
      const isDiagonal = rowE.code === colE.code;
      const value = isDiagonal
        ? 0
        : (matrix.pairs[pairKey(rowE.code, colE.code)] ?? 0);
      const fill = isDiagonal
        ? "#f9fafb"
        : (args.cellColor(rowE, colE, value) ?? "#ffffff");
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>`,
      );
    });
  });

  // Legend
  let lx = matrixX;
  const ly = gridBottom + 16;
  for (const item of args.legend) {
    parts.push(
      `<rect x="${lx}" y="${ly}" width="11" height="11" rx="2" fill="${item.color}"/>`,
      `<text x="${lx + 15}" y="${ly + 9}" font-size="11" fill="#374151">${esc(item.label)}</text>`,
    );
    lx += 15 + item.label.length * 6.2 + 16;
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}
