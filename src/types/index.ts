export interface CitationInfo {
  id?: string;
  subprogramme_number?: number | null;
  origin_document: string;
  budget_part: string | null;
  section: string | null;
  section_title: string | null;
  entity_long: string | null;
  entity: string | null;
  programme: number | null;
  programme_title: string | null;
  "sub-programme": string | null;
  component: string | null;
  part_in_document: string | null;
}

export interface RecurrenceAction {
  entity: string;
  newer_cited_symbols: string[];
  latest_symbol: string;
  group_title: string;
}

export interface EntityRelevance {
  indices: number[];
  ai_comments: Record<number, string>; // paragraph_index -> comment
}

export interface Paragraph {
  /** Source footnote boundaries measured in UTF-16 code units into text. */
  note_references?: { note_id: number; offset: number }[];
  note_ids?: number[];
  footnotes?: Paragraph[];
  /** Document-level quality flag; internal issue details stay on the server. */
  extraction_quality_warning?: boolean;
  subtype?: string;
  parser_version?: string;
  source?: "digitallibrary";
  source_symbol?: string;
  part_letter?: string;
  /** UUID from mandates.paragraphs */
  id?: string;
  /** 0-based position within the document */
  position?: number;
  text: string;
  type: string; // "title", "paragraph", "heading", etc.
  heading_level: number | null;
  paragraph_type: string | null; // "preambular", "operative", etc.
  paragraph_level: number | null;
  prefix: string | null; // "1.", "(a)", "(i)", etc.
  /** Links from mandates.paragraph_links: [linked_symbol, linked_url] pairs */
  links: [string, string][] | [];
  mandates?: {
    action_verb: string;
    action_verb_normalized?: string;
    action_verb_type: string;
    assignees: {
      assignee: string;
      assignee_normalized: string;
      assignee_type: string;
    }[];
    mentioned_entities: {
      mentioned_entity: string;
      mentioned_entity_normalized: string;
      mentioned_entity_type: string;
    }[];
    deliverables: {
      deliverable: string;
      deliverable_normalized: string;
      deliverable_type: string;
    }[];
  }[];
  /** NLP highlight annotations (from text_with_highlights column) */
  textWithHighlights?: string;
  /** Uncertainty annotations from the extraction pipeline */
  uncertainties?: string;
  /**
   * Structural metadata from the Digital Library semantic fulltext layer
   * (digitallibrary.document_paragraphs). Undefined for mandates.paragraphs rows.
   * Not consumed by the UI yet — reserved for future annex/omnibus rendering.
   */
  section?: string;
  annex_index?: number;
  text_index?: number;
}

export interface PPBRecord {
  full_document_symbol: string;
  num_citations: number;
  num_entities: number;
  entities: (string | null)[];
  link: string | null;
  priority_area: string | null;
  year: number | null;
  body: string | null;
  pillar: string | null;
  entity_long: string | null;
  description: string | null;
  type: string | null;
  citation_info: CitationInfo[];
  document_symbol: string | null;
  uniform_title: string | null;
  metadata_from_db?: boolean;
  recurrence_actions?: RecurrenceAction[];
  entity_relevance?: Record<string, EntityRelevance>;
}

// Hierarchical structure for UI
export interface MandateAction {
  type: "DROP" | "UPDATE";
  newerSymbol: string;
}

export interface NewerVersionInfo {
  symbol: string;
  year: number;
}

export interface NewerVersion {
  symbol: string;
  title: string | null;
  year: number;
  body: string | null;
  /** All newer versions with their years (for checking if any is already cited) */
  allNewer: NewerVersionInfo[];
}

export interface Mandate {
  citationLocations?: CitationInfo[];
  symbol: string;
  title: string;
  link: string | null;
  year: number | null;
  body: string | null;
  docType: string | null;
  action: MandateAction | null;
  relevanceCount: number;
  relevanceIndices: number[];
  aiComments: Record<number, string>;
  entity?: string;
  entityLong?: string | null;
  isBackground?: boolean;
  otherEntitiesCount: number;
  allEntities: string[];
  entitySubprogrammes: Record<string, string[]>; // entity -> subprogrammes from PPB
  entityLongMap: Record<string, string>;
  allEntityRelevance: Record<string, EntityRelevance>;
  metadataFromDb?: boolean;
  isAdded?: boolean;
  newerVersion?: NewerVersion;
}

export interface EntityData {
  entity: string;
  entityLong: string | null;
  section: string | null;
  sectionTitle: string | null;
  backgroundMandates: Mandate[];
  legislativeMandates: Record<string, Mandate[]>;
}

export interface BudgetPartMeta {
  key: string; // matches database budget_part value
  numeral: string;
  order: number;
  label: string; // display label with "PART X -" prefix
}

export interface PartData {
  part: string;
  numeral: string;
  order: number;
  entities: EntityData[];
}

// Housekeeping decisions (event log)
export type Decision = "retain" | "remove" | "add" | "update" | "cancel";

/** Resolves only when the decision has been persisted, before opening its reason popup. */
export type DecisionChangeHandler = (
  decision: Decision,
  newSymbol?: string,
) => Promise<boolean>;

export type DecisionReasonChangeHandler = (
  reason: string | null,
  otherReason: string | null,
) => Promise<boolean>;

export interface ManualMetadata {
  title?: string;
  body?: string;
  year?: number;
  link?: string;
}

export interface MandateDecision {
  id: string;
  documentSymbol: string;
  entity: string;
  subprogramme: string | null;
  decision: Decision;
  newSymbol: string | null;
  manualMetadata?: ManualMetadata | null;
  decisionReason: string | null;
  otherReason: string | null;
  userEmail: string;
  userEntity: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedByEntity: string | null;
  approvedAt: string | null;
  /** ID of the review session during which this decision was made (null = outside review) */
  reviewSessionId: string | null;
}

/** Response to a review change (accept/revert) */
export interface ReviewChangeResponse {
  id: string;
  entity: string;
  documentSymbol: string;
  subprogramme: string | null;
  reviewSessionId: string;
  responseType: "accept" | "revert";
  respondedBy: string;
  respondedAt: string;
  revertDecisionId: string | null;
  comment: string | null;
}

/** Review change info for a mandate - compares baseline vs in-review decision */
export interface ReviewChangeInfo {
  /** The decision at the time review started (null if no decision existed) */
  baseline: MandateDecision | null;
  /** The latest decision made during the review */
  inReviewDecision: MandateDecision | null;
  /** Whether there was a change during review */
  hasChange: boolean;
  /** User's response to this change (if any) */
  response: ReviewChangeResponse | null;
}

export interface MandateComment {
  id: string;
  documentSymbol: string;
  entity: string;
  subprogramme: string | null;
  comment: string;
  userEmail: string;
  userEntity: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// Current state per mandate (latest decision + full history)
export interface MandateState {
  documentSymbol: string;
  entity: string;
  subprogramme: string | null;
  decision: MandateDecision | null; // latest decision
  decisions: MandateDecision[]; // all decisions (history)
  comments: MandateComment[]; // comments for this entity
}
