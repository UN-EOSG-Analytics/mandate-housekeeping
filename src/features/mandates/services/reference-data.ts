"use server";

import { query } from "@/lib/db/db";
import { unstable_cache } from "next/cache";

export interface IssuingBody {
  id: number;
  name: string;
  abbreviation: string | null;
  description: string | null;
  display_order: number | null;
  is_active: boolean;
}

/**
 * Fetch all active issuing bodies
 * Returns list ordered by display_order for use in dropdowns
 * Cached for 1 hour since reference data changes infrequently
 */
export const getIssuingBodies = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await query<{ name: string }>(
      `SELECT name 
       FROM public.issuing_bodies 
       WHERE is_active = true 
       ORDER BY display_order NULLS LAST, name`,
      [],
      "ppb2026",
    );
    return rows.map((r) => r.name);
  },
  ["issuing-bodies"],
  {
    revalidate: 3600, // Cache for 1 hour
    tags: ["issuing-bodies"],
  },
);

export const fetchBodyFullNames = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const rows = await query<{ entity: string; entity_long: string }>(
      "SELECT entity, entity_long FROM systemchart.entities WHERE entity_long IS NOT NULL",
      [],
      "ppb2026",
    );
    return Object.fromEntries(rows.map((row) => [row.entity, row.entity_long]));
  },
  ["systemchart-body-full-names"],
  { revalidate: 3600 },
);
