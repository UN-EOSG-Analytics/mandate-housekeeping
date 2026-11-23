"use client";

import { typography } from "@un-eosg/ui/typography";
import { getAgeIndicator } from "@/features/mandates/services/age-indicator";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

export function CitationYear({ year }: { year: number | null }) {
  const age = getAgeIndicator(year);
  return (
    <Tooltip content={age.tooltip}>
      <span
        className={cn(
          typography.numeric,
          "inline-block cursor-help rounded px-1.5 py-0.5 text-xs",
          age.bgColor,
          age.color,
        )}
      >
        {year ?? "—"}
      </span>
    </Tooltip>
  );
}
