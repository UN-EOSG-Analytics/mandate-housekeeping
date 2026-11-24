import type { NewerVersion } from "@/types";

export interface DocumentSeriesIdentity {
  issuer: string;
  kind: "RES" | "DEC" | "PRST";
}

/** A catalogue body can describe an entire UN organ family. Keep the issuing
 * subsidiary body and outcome type from the full symbol as an independent key. */
export function documentSeriesIdentity(
  symbol: string,
): DocumentSeriesIdentity | null {
  let normalized = symbol.replace(/\s/g, "").toUpperCase();
  if (normalized.startsWith("[") && normalized.endsWith("]"))
    normalized = normalized.slice(1, -1);
  // Composite symbols and incomplete references cannot establish one issuer.
  if (/[;,]/.test(normalized)) return null;
  const match =
    /^([A-Z][A-Z0-9.]*(?:\/[A-Z0-9.()\-]+)*)\/(RES|DEC|PRST)\/(.+)$/.exec(
      normalized,
    );
  if (
    !match ||
    !/^[A-Z0-9./()\-]+(?:\[[A-Z]+\])?$/.test(match[3]) ||
    !/\d|[IVXLCDM]/.test(match[3]) ||
    /\/(?:RES|DEC|PRST)\//.test(match[3])
  )
    return null;
  const parts = match[1].split("/");
  if (parts.some((part) => ["RES", "DEC", "PRST"].includes(part))) return null;
  // Historic symbols put a session before the outcome marker, e.g.
  // A/53/DEC/428, A/HRC/13/PRST/1 and E/ECA/CM/11/RES/540(XX).
  while (parts.length > 1 && /^\d+$/.test(parts.at(-1)!)) parts.pop();
  let issuer = parts.join("/");
  // E/CEPAL is the historic symbol prefix of the same regional commission.
  if (issuer === "E/CEPAL") issuer = "E/LC";
  return { issuer, kind: match[2] as DocumentSeriesIdentity["kind"] };
}

export function sameDocumentSeriesIdentity(
  source: string,
  candidate: string,
): boolean {
  const a = documentSeriesIdentity(source);
  const b = documentSeriesIdentity(candidate);
  return !!a && !!b && a.issuer === b.issuer && a.kind === b.kind;
}

/** Defend client-side notes against stale or mixed-family candidate payloads.
 * A tied latest year is a list of choices, not one automatic suggestion. */
export function safeNewerVersion(
  source: string,
  version: NewerVersion | undefined,
): NewerVersion | undefined {
  if (!version || !sameDocumentSeriesIdentity(source, version.symbol))
    return undefined;
  const unique = new Map<string, { symbol: string; year: number }>();
  for (const candidate of version.allNewer) {
    if (
      !sameDocumentSeriesIdentity(source, candidate.symbol) ||
      !Number.isInteger(candidate.year) ||
      candidate.year <= 0
    )
      continue;
    const symbol = candidate.symbol.replace(/\s/g, "").toUpperCase();
    const previous = unique.get(symbol);
    if (previous && previous.year !== candidate.year) return undefined;
    if (!previous) unique.set(symbol, candidate);
  }
  const allNewer = [...unique.values()];
  const latestYear = Math.max(...allNewer.map((candidate) => candidate.year));
  const latestCandidates = allNewer.filter(
    (candidate) => candidate.year === latestYear,
  );
  if (latestYear !== version.year || latestCandidates.length !== 1)
    return undefined;
  const latest = latestCandidates[0];
  if (
    latest.symbol.replace(/\s/g, "").toUpperCase() !==
    version.symbol.replace(/\s/g, "").toUpperCase()
  )
    return undefined;
  return { ...version, allNewer };
}
