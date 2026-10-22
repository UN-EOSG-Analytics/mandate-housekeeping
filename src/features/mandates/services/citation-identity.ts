/** Match the review table's persisted programme-level and background keys. */
export function citationSubprogramme(
  subprogramme: string | null,
  component: string | null,
  part: string | null,
): string | null {
  return part === "Mandates and background"
    ? null
    : subprogramme || component || "Legislative mandates";
}

export function mandateKey(
  entity: string,
  symbol: string,
  subprogramme: string | null,
): string {
  return JSON.stringify([entity, symbol, subprogramme || null]);
}
