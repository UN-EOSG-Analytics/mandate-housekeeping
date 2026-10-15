import { fetchFulltextAction } from "@/features/mandates/actions/fulltext";
import type { Paragraph } from "@/types";

/** Current successful English Digital Library parses; static assets are retained for audit. */
export async function fetchParagraphs(
  symbol: string,
): Promise<Paragraph[] | null> {
  return fetchFulltextAction(symbol);
}
