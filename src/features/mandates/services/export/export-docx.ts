import JSZip from "jszip";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  getAppliedExportData,
  type AppliedMandateRow,
} from "@/features/mandates/services/export/applied-state";
import { query } from "@/lib/db/db";

interface Mandate {
  symbol: string;
  title: string;
  link: string | null;
  body: string | null;
  docType: string | null;
}

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

async function fetchBodyFullNames(): Promise<Record<string, string>> {
  const rows = await query<{ entity: string; entity_long: string }>(
    "SELECT entity, entity_long FROM systemchart.entities",
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.entity] = row.entity_long;
  }
  return map;
}

// Fetch bracket descriptions from meta_title for symbols where the resolved
// title is just "Resolution NNNN (YYYY)" (mainly SC resolutions).
// Returns symbol → bracket text, e.g. "S/RES/1325(2000)" → "[on women and peace and security]"
async function fetchBracketDescriptions(): Promise<Record<string, string>> {
  const rows = await query<{ symbol: string; title: string }>(
    `SELECT symbol, export_bracket_title AS title
     FROM mandates_housekeeping.document_metadata_fallback
     WHERE export_bracket_title LIKE '%[%]%'`,
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    const match = row.title.match(/\[(.+?)\]\s*$/);
    if (match) {
      map[row.symbol] = match[1];
    }
  }
  return map;
}

// Build a section header like "General Assembly resolutions" or "Conventions"
function getBodyTypeLabel(
  body: string,
  typeSuffix: string,
  bodyFullNames: Record<string, string>,
): string {
  if (FIXED_LABELS[body]) return FIXED_LABELS[body];
  const name = getBodyFullName(body, bodyFullNames);
  return `${name} ${typeSuffix}`;
}

function getBodyFullName(
  body: string,
  bodyFullNames: Record<string, string>,
): string {
  const isAlreadyFullName = Object.values(BODY_NAMES).includes(body);
  return isAlreadyFullName
    ? body
    : BODY_NAMES[body] || bodyFullNames[body] || body;
}

function sortBodies(
  bodies: string[],
  bodyFullNames: Record<string, string>,
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

function stripPrefix(symbol: string): string {
  // HRC: A/HRC/RES/12/10, A/HRC/DEC/18/117, A/HRC/PRST/15/2, A/HRC/PRST/OS/12/1
  const hrc = symbol
    .replace(/^A\/HRC\/RES\//, "")
    .replace(/^A\/HRC\/DEC\//, "")
    .replace(/^A\/HRC\/PRST\/OS\//, "")
    .replace(/^A\/HRC\/PRST\//, "");
  if (hrc !== symbol) return normalizeSymbolSpacing(hrc.trim());
  // Standard UN organs: A/RES/70/1, S/RES/2250, S/PRST/2004/36, E/DEC/2015/1, etc.
  const standard = symbol
    .replace(/^[AES]\/RES\//, "")
    .replace(/^[AES]\/DEC\//, "")
    .replace(/^S\/RES\//, "")
    .replace(/^S\/PRST\//, "");
  if (standard !== symbol) return normalizeSymbolSpacing(standard.trim());
  // Commission on Human Rights: E/CN.4/RES/ 1993/2A → 1993/2A
  const chr = symbol.replace(/^E\/CN\.4\/RES\/\s*/, "");
  if (chr !== symbol) return normalizeSymbolSpacing(chr.trim());
  // Regional commissions with /RES/ prefix: E/ESCWA/RES/214(XIX)
  const regionalRes = symbol.replace(/^E\/\w+\/RES\//, "");
  if (regionalRes !== symbol) return normalizeSymbolSpacing(regionalRes.trim());
  // UNEP Environment Assembly: UNEP/EA.1/RES.1 → 1/1, UNEP/EA.1/L.13 → 1/L.13
  const unepEA = symbol.match(/^UNEP\/EA\.(\d+)\/(?:RES\.|L\.)(.+)$/);
  if (unepEA) return normalizeSymbolSpacing(`${unepEA[1]}/${unepEA[2]}`.trim());
  // UNEP Governing Council: UNEP/GC 27/10 → 27/10, UNEP/GC SS.XI/5 → SS.XI/5
  const unepGC = symbol.match(/^UNEP\/GC\s+(.+)$/);
  if (unepGC) return normalizeSymbolSpacing(unepGC[1].trim());
  // UN-Habitat Governing Council: HSP/GC/24/7 → 24/7
  const hspGC = symbol.match(/^HSP\/GC\/(.+)$/);
  if (hspGC) return normalizeSymbolSpacing(hspGC[1].trim());
  // UN-Habitat Executive Board: HSP/EB 2024/5 → 2024/5
  const hspEB = symbol.match(/^HSP\/EB\s+(.+)$/);
  if (hspEB) return normalizeSymbolSpacing(hspEB[1].trim());
  // UN-Habitat Committee of Permanent Representatives: HSP/CPR 1/1 → 1/1
  const hspCPR = symbol.match(/^HSP\/CPR\s+(.+)$/);
  if (hspCPR) return normalizeSymbolSpacing(hspCPR[1].trim());
  // CTOC/COP: CTOC/COP 12/3 → 12/3
  const ctoc = symbol.match(/^CTOC\/COP\s+(.+)$/);
  if (ctoc) return normalizeSymbolSpacing(ctoc[1].trim());
  // CAC/COSP: CAC/COSP 10/5 → 10/5
  const cac = symbol.match(/^CAC\/COSP\s+(.+)$/);
  if (cac) return normalizeSymbolSpacing(cac[1].trim());
  // Governing bodies with "Resolution NNN" or "Decision NNN" in symbol text
  const bodyRes = symbol.match(/\b(?:Resolution|Decision)\s+(.+)$/i);
  if (bodyRes) return normalizeSymbolSpacing(bodyRes[1].trim());
  return normalizeSymbolSpacing(symbol.trim());
}

// Ensure space before parenthetical year/session: "1904(2009)" → "1904 (2009)"
function normalizeSymbolSpacing(s: string): string {
  return s.replace(/(\d)\(/, "$1 (");
}

// Reverse lookup: full name → abbreviation (e.g. "Human Rights Council" → "HRC")
const BODY_ABBREV: Record<string, string> = {};
for (const [abbr, full] of Object.entries(BODY_NAMES)) {
  BODY_ABBREV[full] = abbr;
}

// Normalize and reclassify body values so that e.g. "Human Rights Council" and "HRC"
// both map to the same key, and symbol-based overrides are applied.
function classifyBody(body: string, symbol: string): string {
  if (symbol.startsWith("CAC/COSP")) return "CAC/COSP";
  if (symbol.startsWith("CTOC/COP")) return "UNTOC COP";
  if (symbol.startsWith("E/CN.4/")) return "CHR";
  // Normalize full names back to abbreviations for consistent map keys
  return BODY_ABBREV[body] || body;
}

function isDecision(symbol: string): boolean {
  return /^[AES]\/DEC\//.test(symbol) || /^A\/HRC\/DEC\//.test(symbol);
}

function isPresidentialStatement(symbol: string): boolean {
  return /^S\/PRST\//.test(symbol) || /^A\/HRC\/PRST\//.test(symbol);
}

function escapeXml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanTitle(title: string): string {
  return title.replace(/[\s:]+$/, "");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Detect titles that are just the resolution label (e.g. "Resolution 1325 (2000)")
// and thus redundant with the symbol column
const REDUNDANT_TITLE_RE =
  /^(Security Council )?resolution\s+\d+(?:\s*\(\d{4}\))?\s*\/?$/i;

// Enhance mandate titles: replace redundant "Resolution NNNN (YYYY)" titles
// with bracket descriptions where available, or empty string if none.
// Also clean up PRST titles to just the topic name.
//
// NOTE: DGACM guidelines currently require SC documents to have NO titles.
// The title enhancement logic for SC resolutions and PRST statements is kept
// here but disabled — hopefully we can re-enable it in the future.
function enhanceTitles(
  mandates: Mandate[],
  bracketDescs: Record<string, string>,
): void {
  for (const m of mandates) {
    // SC documents: clear title per DGACM guidelines (no titles allowed)
    if (m.body === "Security Council" || m.body === "SC") {
      m.title = "";
      continue;
    }
    // --- SC title enhancement (disabled, kept for future use) ---
    // if (REDUNDANT_TITLE_RE.test(m.title)) {
    //   m.title = capitalize(bracketDescs[m.symbol] || "");
    // } else if (isPresidentialStatement(m.symbol)) {
    //   const bracketText = bracketDescs[m.symbol];
    //   m.title = bracketText ? extractPrstTopic(bracketText) : "";
    // }
    if (REDUNDANT_TITLE_RE.test(m.title)) {
      m.title = capitalize(bracketDescs[m.symbol] || "");
    }
  }
}

// Style IDs from UN template: H1 = "_ H_1", H23 = "_ H_2/3", H4 = "_ H_4"

const H23_TABS = `<w:tabs><w:tab w:val="right" w:pos="1022"/><w:tab w:val="left" w:pos="1267"/><w:tab w:val="left" w:pos="1742"/><w:tab w:val="left" w:pos="2218"/><w:tab w:val="left" w:pos="2693"/><w:tab w:val="left" w:pos="3182"/><w:tab w:val="left" w:pos="3658"/><w:tab w:val="left" w:pos="4133"/><w:tab w:val="left" w:pos="4622"/><w:tab w:val="left" w:pos="5098"/><w:tab w:val="left" w:pos="5573"/><w:tab w:val="left" w:pos="6048"/></w:tabs>`;

// Cell paragraph properties matching UN SingleTxt style with cleared inherited tabs
const CELL_PPR_SYMBOL = `<w:pPr><w:pStyle w:val="SingleTxt"/><w:tabs><w:tab w:val="clear" w:pos="1267"/><w:tab w:val="clear" w:pos="1742"/><w:tab w:val="clear" w:pos="2218"/><w:tab w:val="clear" w:pos="2693"/><w:tab w:val="clear" w:pos="3182"/><w:tab w:val="clear" w:pos="3658"/><w:tab w:val="clear" w:pos="4133"/><w:tab w:val="clear" w:pos="4622"/><w:tab w:val="clear" w:pos="5098"/><w:tab w:val="clear" w:pos="5573"/><w:tab w:val="clear" w:pos="6048"/><w:tab w:val="left" w:pos="288"/><w:tab w:val="left" w:pos="576"/><w:tab w:val="left" w:pos="864"/><w:tab w:val="left" w:pos="1152"/></w:tabs><w:spacing w:before="40" w:after="40" w:line="200" w:lineRule="exact"/><w:ind w:left="0" w:right="43"/><w:jc w:val="left"/><w:rPr><w:sz w:val="17"/></w:rPr></w:pPr>`;

const CELL_PPR_TITLE = `<w:pPr><w:pStyle w:val="SingleTxt"/><w:tabs><w:tab w:val="clear" w:pos="1267"/><w:tab w:val="clear" w:pos="1742"/><w:tab w:val="clear" w:pos="2218"/><w:tab w:val="clear" w:pos="2693"/><w:tab w:val="clear" w:pos="3182"/><w:tab w:val="clear" w:pos="3658"/><w:tab w:val="clear" w:pos="4133"/><w:tab w:val="clear" w:pos="4622"/><w:tab w:val="clear" w:pos="5098"/><w:tab w:val="clear" w:pos="5573"/><w:tab w:val="clear" w:pos="6048"/><w:tab w:val="left" w:pos="288"/><w:tab w:val="left" w:pos="576"/><w:tab w:val="left" w:pos="864"/><w:tab w:val="left" w:pos="1152"/></w:tabs><w:spacing w:before="40" w:after="40" w:line="200" w:lineRule="exact"/><w:ind w:left="86" w:right="43"/><w:jc w:val="left"/><w:rPr><w:sz w:val="17"/></w:rPr></w:pPr>`;

// Empty spacer paragraphs matching the reference document pattern
const EMPTY_SINGLETXT = `<w:p><w:pPr><w:pStyle w:val="SingleTxt"/></w:pPr></w:p>`;
const EMPTY_PARA = `<w:p/>`;

// Generate paragraph XML matching exact UN reference formatting
function paraH1(text: string): string {
  const t = escapeXml(text);
  return `<w:p><w:pPr><w:pStyle w:val="H1"/><w:ind w:right="1260"/></w:pPr><w:r><w:tab/></w:r><w:r><w:tab/><w:t>${t}</w:t></w:r></w:p>`;
}

// H23 pair: emits spacer before, both lines with keepNext, spacer after
function paraH23Pair(line1: string, line2: string): string {
  const t1 = escapeXml(line1);
  const t2 = escapeXml(line2);
  return `${EMPTY_SINGLETXT}<w:p><w:pPr><w:pStyle w:val="H23"/>${H23_TABS}<w:keepNext/><w:ind w:left="1267" w:right="1260" w:hanging="1267"/></w:pPr><w:r><w:tab/></w:r><w:r><w:tab/><w:t>${t1}</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="H23"/>${H23_TABS}<w:ind w:left="1267" w:right="1260" w:hanging="1267"/></w:pPr><w:r><w:tab/></w:r><w:r><w:tab/><w:t>${t2}</w:t></w:r></w:p>${EMPTY_SINGLETXT}`;
}

// Single H23 line (when subprogramme name doesn't split into label+title)
function paraH23(text: string): string {
  const t = escapeXml(text);
  return `${EMPTY_SINGLETXT}<w:p><w:pPr><w:pStyle w:val="H23"/>${H23_TABS}<w:ind w:left="1267" w:right="1260" w:hanging="1267"/></w:pPr><w:r><w:tab/></w:r><w:r><w:tab/><w:t>${t}</w:t></w:r></w:p>${EMPTY_SINGLETXT}`;
}

function paraH4(text: string): string {
  const t = escapeXml(text);
  return `${EMPTY_PARA}<w:p><w:pPr><w:pStyle w:val="H4"/><w:ind w:right="1260"/></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>${EMPTY_PARA}`;
}

// A grouped citation entry: one or more mandates sharing the same title
interface CitationEntry {
  mandates: Mandate[];
  title: string;
}

// UN document symbol formats changed over time:
//
// - GA sessions I–XXX (1946–1975): sequential resolution number + session in
//   Roman numerals, e.g. A/RES/2106(XX) → stripped "2106(XX)".
// - GA sessions 31+ (1976–present): session/number,
//   e.g. A/RES/54/12 → stripped "54/12".
// - ECOSOC had a similar transition from NUMBER(SESSION) to YEAR/NUMBER.
// - SC always uses NUMBER(YEAR), e.g. S/RES/1244(1999) → "1244(1999)".
//   Since all SC symbols share this format, no old/new reordering is needed.
// - HRC (est. 2006) always uses SESSION/NUMBER.
//
// Within a body section, old-format symbols should sort before new-format
// ones because they represent chronologically earlier resolutions. We detect
// old-format by checking for "NUMBER(…)" with no "/" in the stripped symbol.
// Within each format group, localeCompare with { numeric: true } gives
// natural ordering (e.g. "8/8" before "31/31", not lexicographic).
const OLD_SYMBOL_FORMAT_RE = /^\d+\s*\(.+\)$/;

function compareByDisplaySymbol(a: Mandate, b: Mandate): number {
  const sa = stripPrefix(a.symbol);
  const sb = stripPrefix(b.symbol);
  const aOld = OLD_SYMBOL_FORMAT_RE.test(sa);
  const bOld = OLD_SYMBOL_FORMAT_RE.test(sb);
  if (aOld !== bOld) return aOld ? -1 : 1;
  return sa.localeCompare(sb, undefined, { numeric: true });
}

// Group mandates with identical titles, preserving symbol sort order.
// Mandates with empty titles are never grouped — each gets its own row.
function groupByTitle(mandates: Mandate[]): CitationEntry[] {
  const sorted = [...mandates].sort(compareByDisplaySymbol);
  const titleMap = new Map<string, Mandate[]>();
  const titleOrder: string[] = [];
  const ungrouped: CitationEntry[] = [];
  for (const m of sorted) {
    const key = m.title.trim();
    if (!key) {
      ungrouped.push({ mandates: [m], title: "" });
      continue;
    }
    if (!titleMap.has(key)) {
      titleMap.set(key, []);
      titleOrder.push(key);
    }
    titleMap.get(key)!.push(m);
  }
  const grouped = titleOrder.map((t) => ({
    mandates: titleMap.get(t)!,
    title: t,
  }));
  // Merge grouped and ungrouped, then sort all entries by first display symbol
  const all = [...grouped, ...ungrouped];
  all.sort((a, b) => compareByDisplaySymbol(a.mandates[0], b.mandates[0]));
  return all;
}

// Build symbol cell with potentially multiple symbols joined by "; "
function buildSymbolCell(
  entry: CitationEntry,
  hyperlinks: Map<string, string>,
): string {
  const parts: string[] = [];
  for (const m of entry.mandates) {
    const displaySymbol = escapeXml(stripPrefix(m.symbol));
    if (m.link) {
      const rId = `rId${hyperlinks.size + 10}`;
      hyperlinks.set(rId, m.link);
      parts.push(
        `<w:hyperlink r:id="${rId}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:sz w:val="17"/></w:rPr><w:t>${displaySymbol}</w:t></w:r></w:hyperlink>`,
      );
    } else {
      parts.push(
        `<w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t>${displaySymbol}</w:t></w:r>`,
      );
    }
  }
  // Join with "; " runs between each symbol
  const separator = `<w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">; </w:t></w:r>`;
  const symbolContent = parts.join(separator);
  return `<w:tc><w:tcPr><w:tcW w:w="1465" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:tcPr><w:p>${CELL_PPR_SYMBOL}${symbolContent}</w:p></w:tc>`;
}

// Map body names found in titles to UN document symbol prefixes
const TITLE_BODY_TO_PREFIX: Record<string, string> = {
  "General Assembly": "A/RES/",
  "Security Council": "S/RES/",
  "Economic and Social Council": "E/RES/",
  "Human Rights Council": "A/HRC/RES/",
};

// Pattern: "Body resolution(s) 71/243" — captures body name and number
const TITLE_RES_RE = new RegExp(
  `(${Object.keys(TITLE_BODY_TO_PREFIX).join("|")})\\s+resolutions?\\s+(\\d+(?:/\\d+)*)`,
  "gi",
);

// Build title cell with inline hyperlinks for resolution references
function buildTitleCell(
  entry: CitationEntry,
  hyperlinks: Map<string, string>,
): string {
  const raw = entry.title;
  const segments: string[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(TITLE_RES_RE)) {
    const bodyName = match[1];
    const num = match[2];
    const prefix = TITLE_BODY_TO_PREFIX[bodyName];
    if (!prefix) continue;

    // Text before the match
    if (match.index > lastIndex) {
      segments.push(textRun(raw.slice(lastIndex, match.index)));
    }
    // "General Assembly resolution " as plain text
    const labelEnd = match.index + match[0].length - num.length;
    segments.push(textRun(raw.slice(match.index, labelEnd)));
    // The number as a hyperlink — HRC resolutions use OHCHR links
    const fullSymbol = `${prefix}${num}`;
    const url =
      prefix === "A/HRC/RES/"
        ? `https://ap.ohchr.org/documents/dpage_e.aspx?si=${fullSymbol.toLowerCase()}`
        : `https://documents.un.org/en/${fullSymbol}`;
    const rId = `rId${hyperlinks.size + 10}`;
    hyperlinks.set(rId, url);
    segments.push(
      `<w:hyperlink r:id="${rId}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:sz w:val="17"/></w:rPr><w:t>${escapeXml(num)}</w:t></w:r></w:hyperlink>`,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text (or entire title if no matches)
  if (lastIndex < raw.length) {
    segments.push(textRun(raw.slice(lastIndex)));
  }

  const content = segments.length > 0 ? segments.join("") : textRun(raw);

  return `<w:tc><w:tcPr><w:tcW w:w="3535" w:type="pct"/><w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:tcPr><w:p>${CELL_PPR_TITLE}${content}</w:p></w:tc>`;
}

function textRun(text: string): string {
  return `<w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

const CHARTER_URL = "https://www.un.org/en/about-us/un-charter/full-text";

// Render Charter section as a single paragraph: "Articles 1, 7, 12 (2) and 50"
// Non-article symbols (e.g. "ICJ Statute") rendered separately after
function charterContent(
  mandates: Mandate[],
  hyperlinks: Map<string, string>,
): string {
  const articles: string[] = [];
  const other: Mandate[] = [];

  for (const m of mandates) {
    const artMatch = m.symbol.match(/^UN Charter Article\s+(.+)$/i);
    if (artMatch) {
      articles.push(artMatch[1].trim());
    } else {
      other.push(m);
    }
  }

  let xml = "";

  if (articles.length > 0) {
    // Natural sort: "1", "7", "12 (2)", "102"
    articles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const label = articles.length === 1 ? "Article" : "Articles";
    // Join: "1, 7, 12 (2) and 50"
    let joined: string;
    if (articles.length === 1) {
      joined = articles[0];
    } else {
      joined =
        articles.slice(0, -1).join(", ") +
        " and " +
        articles[articles.length - 1];
    }
    const text = `${label} ${joined}`;

    const rId = `rId${hyperlinks.size + 10}`;
    hyperlinks.set(rId, CHARTER_URL);
    // Left-aligned paragraph matching H4/table indent level
    xml += `<w:p><w:pPr><w:pStyle w:val="SingleTxt"/><w:ind w:left="0" w:right="1260"/></w:pPr><w:hyperlink r:id="${rId}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:hyperlink></w:p>`;
  }

  // Render non-article charter items (e.g. ICJ Statute) as a normal table
  if (other.length > 0) {
    xml += citationTable(other, hyperlinks);
  }

  return xml;
}

// Classify a mandate's document type using symbol-based regex first, then docType fallback
function classifyDocType(m: Mandate): string {
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
const DOC_TYPE_ORDER = [
  "resolutions",
  "decisions",
  "conclusions",
  "declarations",
  "recommendations",
  "statements",
];

// Statement headers use a special format
function getStatementLabel(body: string): string {
  const isSC = body === "Security Council" || body === "SC";
  const isHRC = body === "Human Rights Council" || body === "HRC";
  if (isSC) return "Statements by the President of the Security Council";
  if (isHRC)
    return "President\u2019s statements agreed upon by the Human Rights Council";
  return `${body} statements`;
}

// Render a body section, splitting into separate sub-sections per document type
function renderBodySection(
  body: string,
  mandates: Mandate[],
  hyperlinks: Map<string, string>,
  bodyFullNames: Record<string, string>,
  bracketDescs: Record<string, string>,
): string {
  enhanceTitles(mandates, bracketDescs);

  if (body === "Charter") {
    return (
      paraH4(getBodyTypeLabel(body, "resolutions", bodyFullNames)) +
      charterContent(mandates, hyperlinks)
    );
  }

  // Group mandates by classified document type
  const byType = new Map<string, Mandate[]>();
  for (const m of mandates) {
    const dt = classifyDocType(m);
    if (!byType.has(dt)) byType.set(dt, []);
    byType.get(dt)!.push(m);
  }

  // Sort types by defined order; unknown types go at the end
  const sortedTypes = [...byType.keys()].sort((a, b) => {
    const ai = DOC_TYPE_ORDER.indexOf(a);
    const bi = DOC_TYPE_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  let content = "";
  for (const dt of sortedTypes) {
    const items = byType.get(dt)!;
    if (dt === "statements") {
      content += paraH4(getStatementLabel(body));
    } else {
      content += paraH4(getBodyTypeLabel(body, dt, bodyFullNames));
    }
    content += citationTable(items, hyperlinks);
  }

  return content;
}

// Continuous section break switching to 2-column layout
const SECT_BREAK_2COL = `<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:cols w:space="720"/></w:sectPr></w:pPr></w:p>`;

// Continuous section break switching back to 1-column layout
const SECT_BREAK_1COL = `<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:cols w:num="2" w:space="240"/></w:sectPr></w:pPr></w:p>`;

// Generate table XML for citations (2-column table: symbol + title)
// Wrapped in continuous section breaks that enable Word's native 2-column flow,
// so content fills left column then right column per page automatically.
function citationTable(
  mandates: Mandate[],
  hyperlinks: Map<string, string>,
): string {
  const entries = groupByTitle(mandates);

  let rows = "";
  for (const entry of entries) {
    rows += `<w:tr>${buildSymbolCell(entry, hyperlinks)}${buildTitleCell(entry, hyperlinks)}</w:tr>`;
  }

  const table = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="1408"/><w:gridCol w:w="3397"/></w:tblGrid>${rows}</w:tbl>`;

  // Wrap: switch to 2-col before table, switch back to 1-col after
  return SECT_BREAK_2COL + table + SECT_BREAK_1COL;
}

export async function exportEntityToDocx(
  entityAbbrev: string,
): Promise<Buffer> {
  // Load template
  const templatePath = join(
    process.cwd(),
    "data/references/un_styles_template.docx",
  );
  const templateBuffer = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);

  const [{ rows }, bodyFullNames, bracketDescs] = await Promise.all([
    getAppliedExportData(entityAbbrev),
    fetchBodyFullNames(),
    fetchBracketDescriptions(),
  ]);

  // Build structure: subprog -> body -> mandates
  const bySubprog: Map<string, Map<string, Mandate[]>> = new Map();
  const seen = new Set<string>();

  for (const row of rows) {
    const subprog = row.subprogramme || "All Subprogrammes";
    const key = `${subprog}:${row.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const body = classifyBody(row.body || "Other", row.symbol);
    if (!bySubprog.has(subprog)) bySubprog.set(subprog, new Map());
    const bodyMap = bySubprog.get(subprog)!;
    if (!bodyMap.has(body)) bodyMap.set(body, []);

    bodyMap.get(body)!.push({
      symbol: row.symbol,
      title: cleanTitle(row.title),
      link: row.link,
      body,
      docType: row.docType,
    });
  }

  // Check if we found any data
  if (bySubprog.size === 0) {
    throw new Error(
      `No legislative mandates found for entity: ${entityAbbrev}`,
    );
  }

  // Sort subprogrammes
  const sortedSubprogs = [...bySubprog.keys()].sort((a, b) => {
    if (a.toLowerCase().includes("all subprogrammes")) return -1;
    if (b.toLowerCase().includes("all subprogrammes")) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  // Generate document content
  const hyperlinks = new Map<string, string>();
  let content = "";

  // Main header
  content += paraH1("Legislative mandates");

  for (const subprog of sortedSubprogs) {
    const bodyMap = bySubprog.get(subprog)!;

    // Subprogramme header (except for overall)
    if (!subprog.toLowerCase().includes("all subprogrammes")) {
      const match = subprog.match(/^(Subprogramme \d+)[.:]\s*(.+)$/i);
      if (match) {
        content += paraH23Pair(match[1], match[2]);
      } else {
        content += paraH23(subprog);
      }
    }

    for (const body of sortBodies([...bodyMap.keys()], bodyFullNames)) {
      const mandates = bodyMap.get(body)!;
      content += renderBodySection(
        body,
        mandates,
        hyperlinks,
        bodyFullNames,
        bracketDescs,
      );
    }
  }

  // Build document.xml
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${content}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // Build document.xml.rels with hyperlinks
  let relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`;

  for (const [rId, url] of hyperlinks) {
    relsContent += `\n  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`;
  }
  relsContent += `\n</Relationships>`;

  // Update zip
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsContent);

  // Generate output
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return buffer;
}

// Build content for a single entity (reusable)
function buildEntityContent(
  rows: AppliedMandateRow[],
  entityAbbrev: string,
  hyperlinks: Map<string, string>,
  bodyFullNames: Record<string, string>,
  bracketDescs: Record<string, string>,
): string {
  const bySubprog: Map<string, Map<string, Mandate[]>> = new Map();
  const seen = new Set<string>();

  for (const row of rows) {
    if (row.entity !== entityAbbrev) continue;

    const subprog = row.subprogramme || "All Subprogrammes";
    const key = `${subprog}:${row.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const body = classifyBody(row.body || "Other", row.symbol);
    if (!bySubprog.has(subprog)) bySubprog.set(subprog, new Map());
    const bodyMap = bySubprog.get(subprog)!;
    if (!bodyMap.has(body)) bodyMap.set(body, []);

    bodyMap.get(body)!.push({
      symbol: row.symbol,
      title: cleanTitle(row.title),
      link: row.link,
      body,
      docType: row.docType,
    });
  }

  if (bySubprog.size === 0) return "";

  const sortedSubprogs = [...bySubprog.keys()].sort((a, b) => {
    if (a.toLowerCase().includes("all subprogrammes")) return -1;
    if (b.toLowerCase().includes("all subprogrammes")) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  let content = "";
  content += paraH1("Legislative mandates");

  for (const subprog of sortedSubprogs) {
    const bodyMap = bySubprog.get(subprog)!;
    if (!subprog.toLowerCase().includes("all subprogrammes")) {
      const match = subprog.match(/^(Subprogramme \d+)[.:]\s*(.+)$/i);
      if (match) {
        content += paraH23Pair(match[1], match[2]);
      } else {
        content += paraH23(subprog);
      }
    }

    for (const body of sortBodies([...bodyMap.keys()], bodyFullNames)) {
      const mandates = bodyMap.get(body)!;
      content += renderBodySection(
        body,
        mandates,
        hyperlinks,
        bodyFullNames,
        bracketDescs,
      );
    }
  }

  return content;
}

export async function exportAllToDocx(): Promise<Buffer> {
  const templatePath = join(
    process.cwd(),
    "data/references/un_styles_template.docx",
  );
  const templateBuffer = await readFile(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  const [{ rows }, bodyFullNames, bracketDescs] = await Promise.all([
    getAppliedExportData(),
    fetchBodyFullNames(),
    fetchBracketDescriptions(),
  ]);

  // Get all unique entities with their long names
  const entityNames = new Map<string, string>(); // abbrev -> long name
  for (const row of rows) {
    if (!entityNames.has(row.entity)) {
      entityNames.set(row.entity, row.entityLong || row.entity);
    }
  }

  const hyperlinks = new Map<string, string>();
  let content = "";

  // Sort entities alphabetically by long name
  const sortedEntities = [...entityNames.entries()].sort((a, b) =>
    (a[1] || a[0]).localeCompare(b[1] || b[0]),
  );

  for (const [entity, entityLong] of sortedEntities) {
    const entityContent = buildEntityContent(
      rows,
      entity,
      hyperlinks,
      bodyFullNames,
      bracketDescs,
    );
    if (!entityContent) continue;

    // Entity header (bold, larger) - use long name
    const displayName = entityLong || entity;
    content += `<w:p><w:pPr><w:spacing w:before="400" w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(displayName)}</w:t></w:r></w:p>`;
    content += entityContent;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${content}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  let relsContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/>`;

  for (const [rId, url] of hyperlinks) {
    relsContent += `\n  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(url)}" TargetMode="External"/>`;
  }
  relsContent += `\n</Relationships>`;

  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsContent);

  return await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}
