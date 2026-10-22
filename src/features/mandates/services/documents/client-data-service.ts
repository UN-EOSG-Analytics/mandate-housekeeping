import { fetchFulltext } from "../client-reads";
import type { Paragraph } from "@/types";

/** Current successful English Digital Library parses; static assets are retained for audit. */
export async function fetchParagraphs(
  symbol: string,
): Promise<Paragraph[] | null> {
  return fetchFulltext(symbol);
}
