import { getReviewWriteError } from "@/lib/db/review-cycle";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/auth";
import { query } from "@/lib/db/db";
import {
  uploadBlob,
  generateBlobName,
  ensureContainer,
} from "@/lib/storage/azure-blob";

const ALLOWED_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a reviewer
    if (!user.isReviewer) {
      return NextResponse.json(
        { error: "Only reviewers can upload files" },
        { status: 403 },
      );
    }

    const cycleError = await getReviewWriteError();
    if (cycleError) return NextResponse.json({error: cycleError}, {status: 403});

    // Parse form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entity = formData.get("entity") as string | null;
    const subprogramme = formData.get("subprogramme") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!entity) {
      return NextResponse.json(
        { error: "Entity is required" },
        { status: 400 },
      );
    }

    // Check if entity already has an upload
    const existingUpload = await query<{ id: string }>(
      `SELECT id FROM mandates_housekeeping.docx_uploads WHERE entity = $1 LIMIT 1`,
      [entity],
    );

    if (existingUpload.length > 0) {
      return NextResponse.json(
        { error: "A DOCX submission already exists for this entity" },
        { status: 409 },
      );
    }

    // Validate file type
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only DOCX files are allowed" },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 },
      );
    }

    // Ensure container exists
    await ensureContainer();

    // Generate blob name and upload
    const blobName = generateBlobName(entity, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { url: blobUrl } = await uploadBlob(buffer, blobName, file.type);

    // Record in database
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO mandates_housekeeping.docx_uploads 
       (filename, blob_url, blob_name, content_type, size_bytes, entity, subprogramme, user_email, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        file.name,
        blobUrl,
        blobName,
        file.type,
        file.size,
        entity,
        subprogramme || null,
        user.email,
        JSON.stringify({
          budgetVersion: "ppb2026",
          uploadedAt: new Date().toISOString(),
          userAgent: req.headers.get("user-agent") || null,
        }),
      ],
    );

    return NextResponse.json({
      success: true,
      upload: {
        id: result[0].id,
        filename: file.name,
        size: file.size,
        entity,
        subprogramme,
        userEmail: user.email,
        createdAt: result[0].created_at,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}

// GET endpoint to list uploads for an entity
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const entity = req.nextUrl.searchParams.get("entity");
    if (!entity) {
      return NextResponse.json(
        { error: "Entity is required" },
        { status: 400 },
      );
    }

    const uploads = await query<{
      id: string;
      filename: string;
      size_bytes: number;
      entity: string;
      subprogramme: string | null;
      user_email: string;
      created_at: string;
    }>(
      `SELECT id, filename, size_bytes, entity, subprogramme, user_email, created_at
       FROM mandates_housekeeping.docx_uploads
       WHERE entity = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [entity],
    );

    return NextResponse.json({
      uploads: uploads.map((u) => ({
        id: u.id,
        filename: u.filename,
        size: u.size_bytes,
        entity: u.entity,
        subprogramme: u.subprogramme,
        userEmail: u.user_email,
        createdAt: u.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching uploads:", error);
    return NextResponse.json(
      { error: "Failed to fetch uploads" },
      { status: 500 },
    );
  }
}
