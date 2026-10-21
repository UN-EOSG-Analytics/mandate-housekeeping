export interface EntityOverviewSummary {
  entity: string;
  entityLong: string | null;
  section: string | null;
  sectionTitle: string | null;
  mandateCount: number;
}

export interface PartOverviewSummary {
  part: string;
  numeral: string;
  order: number;
  entities: EntityOverviewSummary[];
}
