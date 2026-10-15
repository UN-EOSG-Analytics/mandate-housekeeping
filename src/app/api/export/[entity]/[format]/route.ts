import { getBudgetVersion } from "@/lib/db/review-cycle";
import { NextResponse } from "next/server";
import { exportEntityToDocx } from "@/features/mandates/services/export/export-docx";
import {
  exportToCsv,
  exportToXlsx,
} from "@/features/mandates/services/export/export-excel";
import { getISOTimestamp } from "@/lib/utils";

const CONTENT_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; format: string }> },
) {
  const { entity, format } = await params;

  if (!["docx", "xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  }

  try {
    let buffer: Buffer;
    let contentType: string;
    let ext: string;

    if (format === "docx") {
      buffer = await exportEntityToDocx(entity);
      contentType = CONTENT_TYPES.docx;
      ext = "docx";
    } else if (format === "xlsx") {
      buffer = await exportToXlsx(entity);
      contentType = CONTENT_TYPES.xlsx;
      ext = "xlsx";
    } else {
      buffer = Buffer.from(await exportToCsv(entity));
      contentType = CONTENT_TYPES.csv;
      ext = "csv";
    }

    const budgetVersion = await getBudgetVersion();
    const timestamp = getISOTimestamp();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${timestamp}_${budgetVersion}_${entity}_legislative_mandates.${ext}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (
      message.includes("No legislative mandates found") ||
      message.includes("No mandates found")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
