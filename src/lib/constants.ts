/**
 * Application constants
 */

import type { BudgetPartMeta } from "@/types";

/**
 * Budget parts metadata (static)
 * Defines the 14 UN budget parts (I-XIV) with their roman numeral, display order, and descriptive name
 */
export const BUDGET_PARTS_META: BudgetPartMeta[] = [
  {
    key: "Overall policymaking, direction and coordination",
    numeral: "I",
    order: 1,
    label: "Overall policymaking, direction and coordination",
  },
  {
    key: "Political affairs",
    numeral: "II",
    order: 2,
    label: "Political affairs",
  },
  {
    key: "International justice and law",
    numeral: "III",
    order: 3,
    label: "International justice and law",
  },
  {
    key: "International cooperation for development",
    numeral: "IV",
    order: 4,
    label: "International cooperation for development",
    aliases: ["International cooperation and development"],
  },
  {
    key: "Regional cooperation for development",
    numeral: "V",
    order: 5,
    label: "Regional cooperation for development",
    aliases: ["Regional cooperation and development"],
  },
  {
    key: "Human rights and humanitarian affairs",
    numeral: "VI",
    order: 6,
    label: "Human rights and humanitarian affairs",
  },
  {
    key: "Global communications",
    numeral: "VII",
    order: 7,
    label: "Global communications",
  },
  {
    key: "Common support services",
    numeral: "VIII",
    order: 8,
    label: "Common support services",
  },
  {
    key: "Internal oversight",
    numeral: "IX",
    order: 9,
    label: "Internal oversight",
  },
  {
    key: "Jointly financed administrative activities and special expenses",
    numeral: "X",
    order: 10,
    label: "Jointly financed administrative activities and special expenses",
  },
  {
    key: "Capital expenditure",
    numeral: "XI",
    order: 11,
    label: "Capital expenditure",
  },
  {
    key: "Safety and security",
    numeral: "XII",
    order: 12,
    label: "Safety and security",
  },
  {
    key: "Development account",
    numeral: "XIII",
    order: 13,
    label: "Development account",
  },
  {
    key: "Staff assessment",
    numeral: "XIV",
    order: 14,
    label: "Staff assessment",
  },
];

/**
 * Document year validation constants
 * MIN_YEAR: First UN General Assembly resolution (1946)
 * MAX_YEAR: Current year (updated server-side at build time)
 */
export const MIN_YEAR = 1946;
export const MAX_YEAR = new Date().getFullYear();

/**
 * Abbreviations for common UN issuing bodies
 */
export const BODY_ABBREVS: Record<string, string> = {
  "General Assembly": "GA",
  "Security Council": "SC",
  "Economic and Social Council": "ECOSOC",
  "Human Rights Council": "HRC",
  "Secretary-General": "SG",
  "International Court of Justice": "ICJ",
  "Trusteeship Council": "TC",
};

/**
 * Feature Flags
 *
 * Centralized feature toggles for controlling application functionality.
 *
 * Best Practices:
 * - Set flags here for simple on/off toggles
 * - Can be enhanced with env variables: `process.env.NEXT_PUBLIC_FEATURE_X === 'true'`
 * - For production: use database-backed flags or a service like LaunchDarkly
 *
 * Usage:
 * ```ts
 * import { FEATURE_FLAGS } from '@/lib/constants';
 *
 * if (FEATURE_FLAGS.reviewChangeIndicator) {
 *   // Show feature
 * }
 * ```
 */
export const FEATURE_FLAGS = {
  /**
   * Review Change Indicator
   * Shows visual indicator when decisions are modified during review phase
   * with accept/revert functionality for reviewers
   *
   * Status: In Development
   * @default false
   */
  reviewChangeIndicator: false,
} as const;

/**
 * Type helper for feature flag keys
 */
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
