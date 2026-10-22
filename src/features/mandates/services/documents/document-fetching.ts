"use server";

import { fetchAllVersions, type DocumentVersion } from "./document-versions";
import { fetchDocumentMetadata, type DocumentMetadata } from "./metadata";
import { searchDocuments } from "./search";

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
  return searchDocuments(searchQuery);
}
