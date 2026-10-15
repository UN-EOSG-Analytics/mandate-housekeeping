"use server";

import { getCurrentUser } from "@/features/auth/auth";
import { getParagraphsBySymbol } from "../services/documents/paragraphs";
import {
  isContentElement,
  resolveVisibilityTier,
} from "../services/documents/paragraph-presentation";
import type { Paragraph } from "@/types";

/** Only safe presentation fields leave the server; raw parser issues stay private. */
export async function fetchFulltextAction(
  symbol: string,
): Promise<Paragraph[]> {
  if (!(await getCurrentUser())) throw new Error("Unauthorized");
  if (!symbol.trim() || symbol.length > 300) return [];
  const rows = await getParagraphsBySymbol(symbol);
  const tier = resolveVisibilityTier(rows);
  if (
    !rows.some(
      (p) =>
        p.type !== "heading" &&
        p.type !== "opening" &&
        isContentElement(p, tier),
    )
  )
    return [];
  return rows;
}
