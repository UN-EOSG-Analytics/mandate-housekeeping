import type { ExportDecisionMode } from "@/types";
import ExcelJS from "exceljs";
import {
  getAppliedExportData,
  type AppliedMandateRow,
  type LatestDecisionRow,
} from "@/features/mandates/services/export/applied-state";
import { getBaseUrl } from "@/lib/get-base-url";
import {
  fetchDocumentMetadata,
  cleanTitle as cleanMetadataTitle,
} from "@/features/mandates/services/documents/metadata";

async function getAppliedRows(
  entityFilter?: string,
  mode: ExportDecisionMode = "reviewed",
): Promise<{
  rows: AppliedMandateRow[];
  decisions: LatestDecisionRow[];
}> {
  const data = await getAppliedExportData(entityFilter, mode);
  if (entityFilter && data.rows.length === 0) {
    throw new Error(`No mandates found for entity: ${entityFilter}`);
  }
  return data;
}

export async function exportToCsv(
  entity?: string,
  mode: ExportDecisionMode = "reviewed",
): Promise<string> {
  const { rows } = await getAppliedRows(entity, mode);

  const headers = [
    "Symbol",
    "Title",
    "Body",
    "Year",
    "Link",
    "Entity",
    "Entity Long",
    "Subprogramme",
    "Part",
  ];
  const csvRows = [headers.join(",")];

  for (const r of rows) {
    csvRows.push(
      [
        quote(r.symbol),
        quote(r.title),
        quote(r.body),
        quote(r.year?.toString() || ""),
        quote(r.link || ""),
        quote(r.entity),
        quote(r.entityLong || ""),
        quote(r.subprogramme || ""),
        quote(r.part || ""),
      ].join(","),
    );
  }

  return csvRows.join("\n");
}

function quote(s: string): string {
  // CSV quoting alone does not prevent spreadsheet applications running formulas.
  if (/^\s*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const COLUMN_INFO = [
  {
    key: "symbol",
    header: "Symbol",
    width: 20,
    desc: "Official UN document symbol (e.g., A/RES/78/123)",
  },
  {
    key: "title",
    header: "Title",
    width: 60,
    desc: "Document title or description",
  },
  {
    key: "body",
    header: "Body",
    width: 12,
    desc: "Issuing body: GA (General Assembly), SC (Security Council), ECOSOC, etc.",
  },
  { key: "year", header: "Year", width: 8, desc: "Year of adoption" },
  {
    key: "link",
    header: "Link",
    width: 40,
    desc: "URL to the official document",
  },
  {
    key: "entity",
    header: "Entity",
    width: 15,
    desc: "Entity abbreviation (e.g., DESA, UNOCT)",
  },
  {
    key: "entityLong",
    header: "Entity Full Name",
    width: 40,
    desc: "Full entity name",
  },
  {
    key: "subprogramme",
    header: "Subprogramme",
    width: 30,
    desc: "Subprogramme or component within the entity",
  },
  {
    key: "part",
    header: "Part",
    width: 20,
    desc: "Section type: Legislative mandates or Mandates and background",
  },
] as const;

function buildEntityLongMap(
  rows: AppliedMandateRow[],
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const row of rows) {
    if (!map.has(row.entity)) {
      map.set(row.entity, row.entityLong || null);
    }
  }
  return map;
}

function cleanTitle(title: string | null | undefined): string {
  if (!title) return "";
  return cleanMetadataTitle(title) || "";
}

function resolveDecisionMetadata(
  symbol: string,
  manualMetadata: LatestDecisionRow["manualMetadata"],
  metadataLookup: Record<
    string,
    {
      title: string;
      body: string;
      year: number | null;
      link: string | null;
    } | null
  >,
) {
  const base = metadataLookup[symbol] || {
    title: "",
    body: "",
    year: null,
    link: null,
  };
  return {
    title: manualMetadata?.title ?? base.title,
    body: manualMetadata?.body ?? base.body,
    year: manualMetadata?.year ?? base.year,
    link: manualMetadata?.link ?? base.link,
  };
}

function addSheetHeaders(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  columnWidths: number[],
) {
  const headerRow = sheet.getRow(1);
  headers.forEach((header, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { bold: true };
  });
  columnWidths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
}

export async function exportToXlsx(
  entity?: string,
  mode: ExportDecisionMode = "reviewed",
): Promise<Buffer> {
  const { rows, decisions } = await getAppliedRows(entity, mode);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UN Mandates Housekeeping";
  workbook.created = new Date();

  // Cover sheet
  const cover = workbook.addWorksheet("Cover");
  const title = entity ? `Mandates for ${entity}` : "Legislative mandates";
  const baseUrl = await getBaseUrl();
  const sourceUrl = entity ? `${baseUrl}/entity/${entity}/` : `${baseUrl}/`;

  cover.getCell("A1").value = title;
  cover.getCell("A1").font = { bold: true, size: 16 };
  cover.getCell("A2").value =
    `Generated: ${new Date().toISOString().split("T")[0]}`;
  cover.getCell("A3").value =
    `Total records: ${rows.length} (${mode === "entity" ? "Entity submission" : "Reviewed outcome"})`;
  cover.getCell("A4").value = "Source:";
  cover.getCell("B4").value = { text: sourceUrl, hyperlink: sourceUrl };
  cover.getCell("B4").font = { underline: true };

  cover.getCell("A6").value = "Column Descriptions";
  cover.getCell("A6").font = { bold: true, size: 12 };

  COLUMN_INFO.forEach((col, i) => {
    cover.getCell(`A${7 + i}`).value = col.header;
    cover.getCell(`A${7 + i}`).font = { bold: true };
    cover.getCell(`B${7 + i}`).value = col.desc;
  });

  cover.getColumn("A").width = 20;
  cover.getColumn("B").width = 60;

  // Data sheet
  const data = workbook.addWorksheet("Mandates");

  const dataRows = rows.map((r) => [
    r.symbol,
    r.title,
    r.body,
    r.year,
    r.link || "",
    r.entity,
    r.entityLong || "",
    r.subprogramme || "",
    r.part || "",
  ]);
  addSheetHeaders(
    data,
    COLUMN_INFO.map((col) => col.header),
    COLUMN_INFO.map((col) => col.width),
  );
  dataRows.forEach((row) => data.addRow(row));

  // Freeze header row + first column
  data.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  data.autoFilter = {
    from: "A1",
    to: "I1",
  };

  rows.forEach((r, rowIdx) => {
    const row = data.getRow(rowIdx + 2);
    if (r.link) {
      const linkCell = row.getCell(5);
      linkCell.value = { text: r.link, hyperlink: r.link };
      linkCell.font = { underline: true };
    }
    row.alignment = { wrapText: true, vertical: "top" };
  });

  // Decisions sheet (latest decision only)
  const decisionsSheet = workbook.addWorksheet("Decisions");
  const decisionsColumns = [
    { header: "Symbol", width: 22 },
    { header: "Decision", width: 12 },
    { header: "Old Symbol", width: 22 },
    { header: "Title", width: 60 },
    { header: "Body", width: 12 },
    { header: "Year", width: 8 },
    { header: "Link", width: 40 },
    { header: "Entity", width: 15 },
    { header: "Entity Long", width: 40 },
    { header: "Subprogramme", width: 30 },
    { header: "Part", width: 20 },
  ];

  const symbolsToResolve = new Set<string>();
  decisions.forEach((d) => {
    const targetSymbol =
      d.decision === "update" ? d.newSymbol : d.documentSymbol;
    if (targetSymbol) symbolsToResolve.add(targetSymbol);
  });
  const metadata = await fetchDocumentMetadata([...symbolsToResolve]);
  const metadataLookup: Record<
    string,
    {
      title: string;
      body: string;
      year: number | null;
      link: string | null;
    } | null
  > = {};
  for (const [symbol, meta] of Object.entries(metadata)) {
    metadataLookup[symbol] = meta
      ? {
          title: cleanTitle(meta.title),
          body: meta.body || "",
          year: meta.year ?? null,
          link: meta.link || null,
        }
      : null;
  }
  const entityLongMap = buildEntityLongMap(rows);

  const decisionRows = decisions.map((d) => {
    const targetSymbol =
      d.decision === "update" ? d.newSymbol : d.documentSymbol;
    const resolved = resolveDecisionMetadata(
      targetSymbol || d.documentSymbol,
      d.manualMetadata || null,
      metadataLookup,
    );
    return [
      targetSymbol || d.documentSymbol,
      d.decision.toUpperCase(),
      d.decision === "update" ? d.documentSymbol : "",
      resolved.title,
      resolved.body,
      resolved.year,
      resolved.link || "",
      d.entity,
      entityLongMap.get(d.entity) || "",
      d.subprogramme || "",
      "Legislative mandates",
    ];
  });

  addSheetHeaders(
    decisionsSheet,
    decisionsColumns.map((col) => col.header),
    decisionsColumns.map((col) => col.width || 12),
  );
  decisionRows.forEach((row) => decisionsSheet.addRow(row));

  decisionsSheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  decisionsSheet.autoFilter = {
    from: "A1",
    to: "K1",
  };

  decisionRows.forEach((row, rowIdx) => {
    const link = row[6] as string;
    const sheetRow = decisionsSheet.getRow(rowIdx + 2);
    if (link) {
      const linkCell = sheetRow.getCell(7);
      linkCell.value = { text: link, hyperlink: link };
      linkCell.font = { underline: true };
    }
    sheetRow.alignment = { wrapText: true, vertical: "top" };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
