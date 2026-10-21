"use server";

import { fetchAllVersions, type DocumentVersion } from "./document-versions";
import {
  fetchDocumentMetadata,
  type DocumentMetadata,
  cleanTitle,
} from "./metadata";
import { query } from "@/lib/db/db";

// Return type for actions
type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export async function getDocumentVersionsAction(
  symbol: string,
): Promise<ActionResult<DocumentVersion[]>> {
  try {
    const versions = await fetchAllVersions(symbol);
    return { success: true, data: versions };
  } catch (error) {
    console.error("Error fetching document versions:", error);
    return { success: false, error: "Failed to fetch document versions" };
  }
}

/**
 * Fetch metadata for multiple document symbols
 * Uses smart caching with 1-hour TTL
 */
export async function getDocumentMetadataAction(
  symbols: string[],
): Promise<ActionResult<Record<string, DocumentMetadata | null>>> {
  try {
    const result = await fetchDocumentMetadata(symbols);
    return { success: true, data: result };
  } catch (error) {
    console.error("Error fetching document metadata:", error);
    return { success: false, error: "Failed to fetch document metadata" };
  }
}

// ============================================================================
// Document Search
// ============================================================================

export interface DocumentSearchResult {
  symbol: string;
  title: string | null;
  type: string | null;
  year: number | null;
  body: string | null;
}

/**
 * Search for documents by symbol or title
 * Used for autocomplete in document search inputs
 * @param searchQuery Search term (min 2 characters)
 * @returns Array of matching documents (max 20)
 */
export async function searchDocumentsAction(
  searchQuery: string,
): Promise<DocumentSearchResult[]> {
  const q = searchQuery.trim();
  if (q.length < 2) {
    return [];
  }

  interface DocumentRow {
    symbol: string;
    proper_title: string | null;
    document_type: string | null;
    date_year: number | null;
    issuing_body: string | null;
  }

  // Add-search deliberately includes the registry catalogue AND PPB-only documents.
  // Entity review membership is still restricted by the selected cycle citations.
  // Search by symbol first (exact prefix match), then by title
  const rows = await query<DocumentRow>(
    `SELECT ppb_full_document_symbol AS symbol, display_title AS proper_title,
       ppb_type AS document_type, ppb_year AS date_year, ppb_body AS issuing_body
     FROM public.unified_documents
     WHERE (ppb_full_document_symbol ILIKE $1 || '%'
        OR display_title ILIKE '%' || $1 || '%')
       AND ppb_full_document_symbol !~ '^[0-9]+/[0-9]+$'
     ORDER BY 
       CASE WHEN UPPER(ppb_full_document_symbol) = UPPER($1) THEN 0 ELSE 1 END,
       CASE WHEN ppb_full_document_symbol ILIKE $1 || '%' THEN 0 ELSE 1 END,
       LENGTH(ppb_full_document_symbol),
       ppb_year DESC NULLS LAST
     LIMIT 20`,
    [q],
  );

  return rows.map((r) => ({
    symbol: r.symbol,
    title: cleanTitle(r.proper_title),
    type: r.document_type,
    year: r.date_year,
    body: r.issuing_body,
  }));
}
