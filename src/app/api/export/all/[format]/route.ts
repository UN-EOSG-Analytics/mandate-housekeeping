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

  try {
    let buffer: Buffer;
    let contentType: string;

    if (format === "docx") {
      buffer = await exportAllToDocx();
      contentType = CONTENT_TYPES.docx;
    } else if (format === "xlsx") {
      buffer = await exportToXlsx();
      contentType = CONTENT_TYPES.xlsx;
    } else {
      buffer = Buffer.from(await exportToCsv());
      contentType = CONTENT_TYPES.csv;
    }

    const budgetVersion = await getBudgetVersion();
    const timestamp = getISOTimestamp();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${timestamp}_${budgetVersion}_all_legislative_mandates.${format}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
