import { getExportFallbackCount } from "@/features/mandates/services/export/applied-state";
import type { ExportDecisionMode } from "@/types";
import { SUBMISSION_CYCLES } from "@/lib/db/budget-version";
import { getBudgetVersion } from "@/lib/db/review-cycle";
import { NextResponse } from "next/server";
import {
  exportToCsv,
  exportToXlsx,
} from "@/features/mandates/services/export/export-excel";
import { exportAllToDocx } from "@/features/mandates/services/export/export-docx";
import { getISOTimestamp } from "@/lib/utils";

const CONTENT_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;

  if (!["docx", "xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode") ?? "reviewed";
  if (modeParam !== "entity" && modeParam !== "reviewed") {
    return NextResponse.json(
      { error: "Invalid decision mode" },
      { status: 400 },
    );
  }
  const mode: ExportDecisionMode = modeParam;

  try {
    if (url.searchParams.get("notice") === "1") {
      return NextResponse.json(
        {
          fallbackCount:
            mode === "reviewed" ? await getExportFallbackCount() : 0,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    let buffer: Buffer;
    let contentType: string;

    if (format === "docx") {
      buffer = await exportAllToDocx(mode);
      contentType = CONTENT_TYPES.docx;
    } else if (format === "xlsx") {
      buffer = await exportToXlsx(undefined, mode);
      contentType = CONTENT_TYPES.xlsx;
    } else {
      buffer = Buffer.from(await exportToCsv(undefined, mode));
      contentType = CONTENT_TYPES.csv;
    }

    const budgetVersion = await getBudgetVersion();
    const timestamp = getISOTimestamp();
    const modeLabel =
      mode === "entity" ? "entity_submission" : "reviewed_outcome";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${timestamp}_submissions_ppb${SUBMISSION_CYCLES[budgetVersion].year}_all_${modeLabel}_legislative_mandates.${format}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
