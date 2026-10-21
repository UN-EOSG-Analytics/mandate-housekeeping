/** The external comparison app loads both documents from these query parameters. */
export function getDocumentComparisonUrl(
  originalSymbol: string,
  compareSymbol: string,
): string {
  const params = new URLSearchParams({
    symbol1: originalSymbol,
    symbol2: compareSymbol,
  });
  return `https://diff.un-two-zero.org/?${params}`;
}
