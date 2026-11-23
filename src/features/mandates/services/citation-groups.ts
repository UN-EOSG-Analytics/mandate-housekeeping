// Master hierarchy order for intergovernmental bodies (UN standard).
// Principal organs have fixed positions; governing bodies come after
// and are sorted alphabetically by full name.
const PRINCIPAL_BODY_ORDER: [string, string | null][] = [
  ["Charter", null],
  ["UNCLOS", null],
  ["GA", "General Assembly"],
  ["ECOSOC", "Economic and Social Council"],
  ["TC", "Trusteeship Council"],
  ["SC", "Security Council"],
  ["HRC", "Human Rights Council"],
  ["UNEA", "United Nations Environment Assembly"],
  ["UNHA and Other", "United Nations Habitat Assembly and other"],
];

// Well-known body abbreviation → full name
const BODY_NAMES: Record<string, string> = {
  // Principal organs (from PRINCIPAL_BODY_ORDER)
  GA: "General Assembly",
  ECOSOC: "Economic and Social Council",
  TC: "Trusteeship Council",
  SC: "Security Council",
  HRC: "Human Rights Council",
  UNEA: "United Nations Environment Assembly",
  "UNHA and Other": "United Nations Habitat Assembly and other",
  // Regional commissions
  ECA: "Economic Commission for Africa",
  ECE: "Economic Commission for Europe",
  ECLAC: "Economic Commission for Latin America and the Caribbean",
  ESCAP: "Economic and Social Commission for Asia and the Pacific",
  ESCWA: "Economic and Social Commission for Western Asia",
  // Functional commissions and subsidiary bodies
  CCPCJ: "Commission on Crime Prevention and Criminal Justice",
  CND: "Commission on Narcotic Drugs",
  CPD: "Commission on Population and Development",
  CSD: "Commission for Social Development",
  CHR: "Commission on Human Rights",
  CSW: "Commission on the Status of Women",
  // Treaty bodies and other governing bodies
  "CAC/COSP":
    "Conference of the States Parties to the United Nations Convention against Corruption",
  INCB: "International Narcotics Control Board",
  UNCTAD: "United Nations Conference on Trade and Development",
  "UNTOC COP":
    "Conference of the Parties to the United Nations Convention against Transnational Organized Crime",
  WTO: "World Trade Organization",
};

// Build sort-index for principal organs (fixed positions)
const PRINCIPAL_SORT_INDEX: Record<string, number> = {};
PRINCIPAL_BODY_ORDER.forEach(([abbr, full], i) => {
  PRINCIPAL_SORT_INDEX[abbr] = i;
  if (full) PRINCIPAL_SORT_INDEX[full] = i;
});

// Bodies that get a fixed label (no "resolutions and decisions" suffix)
const FIXED_LABELS: Record<string, string> = {
  Charter: "Charter of the United Nations",
  UNCLOS: "Conventions",
};

// Build a section header like "General Assembly resolutions" or "Conventions"
export function getBodyTypeLabel(
  body: string,
  typeSuffix: string,
  bodyFullNames: Record<string, string> = {},
): string {
  if (FIXED_LABELS[body]) return FIXED_LABELS[body];
  const name = getBodyFullName(body, bodyFullNames);
  return `${name} ${typeSuffix}`;
}

export function getBodyFullName(
  body: string,
  bodyFullNames: Record<string, string> = {},
): string {
  const isAlreadyFullName = Object.values(BODY_NAMES).includes(body);
  return isAlreadyFullName
    ? body
    : BODY_NAMES[body] || bodyFullNames[body] || body;
}

export function sortBodies(
  bodies: string[],
  bodyFullNames: Record<string, string> = {},
): string[] {
  return [...bodies].sort((a, b) => {
    const ai = PRINCIPAL_SORT_INDEX[a] ?? -1;
    const bi = PRINCIPAL_SORT_INDEX[b] ?? -1;
    // Both are principal organs: sort by fixed order
    if (ai !== -1 && bi !== -1) return ai - bi;
    // One is principal, one isn't: principal first
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    // Neither is principal (governing bodies): sort alphabetically by full name
    const aName = getBodyFullName(a, bodyFullNames);
    const bName = getBodyFullName(b, bodyFullNames);
    return aName.localeCompare(bName);
  });
}

// Reverse lookup: full name → abbreviation (e.g. "Human Rights Council" → "HRC")
const BODY_ABBREV: Record<string, string> = {};
for (const [abbr, full] of Object.entries(BODY_NAMES)) {
  BODY_ABBREV[full] = abbr;
}

// Normalize and reclassify body values so that e.g. "Human Rights Council" and "HRC"
// both map to the same key, and symbol-based overrides are applied.
export function classifyBody(body: string, symbol: string): string {
  if (symbol.startsWith("CAC/COSP")) return "CAC/COSP";
  if (symbol.startsWith("CTOC/COP")) return "UNTOC COP";
  if (symbol.startsWith("E/CN.4/")) return "CHR";
  // Normalize full names back to abbreviations for consistent map keys
  return BODY_ABBREV[body] || body;
}

export function isDecision(symbol: string): boolean {
  return /^[AES]\/DEC\//.test(symbol) || /^A\/HRC\/DEC\//.test(symbol);
}

export function isPresidentialStatement(symbol: string): boolean {
  return /^S\/PRST\//.test(symbol) || /^A\/HRC\/PRST\//.test(symbol);
}

// Classify a mandate's document type using symbol-based regex first, then docType fallback
export function classifyDocType(m: {
  symbol: string;
  docType: string | null;
}): string {
  if (isPresidentialStatement(m.symbol)) return "statements";
  if (isDecision(m.symbol)) return "decisions";
  // Symbol contains /RES/ or "Resolution" keyword
  if (/\/RES[./]/.test(m.symbol) || /\bResolution\b/i.test(m.symbol))
    return "resolutions";
  if (/\/DEC[./]/.test(m.symbol) || /\bDecision\b/i.test(m.symbol))
    return "decisions";
  // Fall back to docType field from data
  const dt = (m.docType || "").toLowerCase();
  if (dt.includes("resolution")) return "resolutions";
  if (dt.includes("decision")) return "decisions";
  if (dt.includes("statement")) return "statements";
  if (dt.includes("conclusion")) return "conclusions";
  if (dt.includes("declaration")) return "declarations";
  if (dt.includes("recommendation")) return "recommendations";
  // Default: resolutions (most common)
  return "resolutions";
}

// Document type display order within each body section
export const DOC_TYPE_ORDER = [
  "resolutions",
  "decisions",
  "conclusions",
  "declarations",
  "recommendations",
  "statements",
];

// Statement headers use a special format
export function getStatementLabel(body: string): string {
  const isSC = body === "Security Council" || body === "SC";
  const isHRC = body === "Human Rights Council" || body === "HRC";
  if (isSC) return "Statements by the President of the Security Council";
  if (isHRC)
    return "President\u2019s statements agreed upon by the Human Rights Council";
  return `${body} statements`;
}

/** Shared fascicle body/type hierarchy; preserves the selected order within groups. */
export function groupCitations<
  T extends { symbol: string; body: string | null; docType: string | null },
>(
  citations: T[],
  bodyFullNames: Record<string, string> = {},
): { key: string; body: string; label: string; citations: T[] }[] {
  const bodies = new Map<string, Map<string, T[]>>();
  for (const citation of citations) {
    const body = classifyBody(citation.body || "Other", citation.symbol);
    const type =
      body === "Charter"
        ? "resolutions"
        : classifyDocType(citation);
    if (!bodies.has(body)) bodies.set(body, new Map());
    const types = bodies.get(body)!;
    if (!types.has(type)) types.set(type, []);
    types.get(type)!.push(citation);
  }
  return sortBodies([...bodies.keys()], bodyFullNames).flatMap((body) =>
    [...bodies.get(body)!]
      .sort(([a], [b]) => DOC_TYPE_ORDER.indexOf(a) - DOC_TYPE_ORDER.indexOf(b))
      .map(([type, rows]) => ({
        key: `${body}:${type}`,
        body,
        label:
          type === "statements"
            ? getStatementLabel(body)
            : getBodyTypeLabel(body, type, bodyFullNames),
        citations: rows,
      })),
  );
}
