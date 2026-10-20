/**
 * Centralized Theme Configuration
 *
 * Single source of truth for all UI colors, tokens, and styling patterns.
 * Import and use these constants instead of hardcoding Tailwind classes.
 */

/**
 * Decision color scheme
 * Used across DecisionDropdown, EntityDetail, and all decision-related UI
 */
export const DECISION_THEME = {
  retain: {
    bg: "bg-blue-50",
    bgStrong: "bg-blue-100",
    bgSubtle: "bg-blue-50/20",
    border: "border-blue-200",
    text: "text-foreground",
    textStrong: "text-foreground",
    hover: "hover:border-blue-300",
    hoverBg: "hover:bg-blue-100",
    iconBg: "bg-blue-100",
    iconText: "text-blue-600",
  },
  remove: {
    bg: "bg-red-50",
    bgStrong: "bg-red-100",
    bgSubtle: "bg-red-50/30",
    border: "border-red-200",
    text: "text-foreground",
    textStrong: "text-foreground",
    hover: "hover:border-red-300",
    hoverBg: "hover:bg-red-100",
    iconBg: "bg-red-100",
    iconText: "text-red-600",
  },
  update: {
    bg: "bg-amber-50",
    bgStrong: "bg-amber-100",
    bgSubtle: "bg-amber-50/20",
    border: "border-amber-200",
    text: "text-foreground",
    textStrong: "text-foreground",
    hover: "hover:border-amber-300",
    hoverBg: "hover:bg-amber-100",
    iconBg: "bg-amber-100",
    iconText: "text-amber-600",
  },
  add: {
    bg: "bg-emerald-50",
    bgStrong: "bg-emerald-100",
    bgSubtle: "bg-emerald-50/20",
    border: "border-emerald-200",
    text: "text-foreground",
    textStrong: "text-foreground",
    hover: "hover:border-emerald-300",
    hoverBg: "hover:bg-emerald-100",
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-600",
  },
  default: {
    bg: "bg-white",
    bgStrong: "bg-gray-50",
    bgSubtle: "bg-gray-50/20",
    border: "border-gray-200",
    text: "text-foreground",
    textStrong: "text-foreground",
    hover: "hover:border-gray-300",
    hoverBg: "hover:bg-gray-50",
    iconBg: "bg-gray-100",
    iconText: "text-gray-600",
  },
} as const;

/**
 * Decision badge style - full combined class string for decision badges
 */
export const DECISION_BADGE_STYLES = {
  retain: `${DECISION_THEME.retain.bgStrong} ${DECISION_THEME.retain.text} border ${DECISION_THEME.retain.border}`,
  remove: `${DECISION_THEME.remove.bgStrong} ${DECISION_THEME.remove.text} border ${DECISION_THEME.remove.border}`,
  update: `${DECISION_THEME.update.bgStrong} ${DECISION_THEME.update.text} border ${DECISION_THEME.update.border}`,
  add: `${DECISION_THEME.add.bgStrong} ${DECISION_THEME.add.text} border ${DECISION_THEME.add.border}`,
  "no decision": `${DECISION_THEME.default.bgStrong} ${DECISION_THEME.default.textStrong} border ${DECISION_THEME.default.border}`,
} as const;

/**
 * Standard popup and tooltip styling
 * Use these for consistent elevation and appearance across all floating UI
 */
export const POPUP_STYLES = {
  // Standard popup (dropdowns, menus)
  popup: "rounded-lg border border-gray-200 bg-white shadow-lg",

  // Tooltip (smaller, lighter)
  tooltip: "rounded-md border border-gray-200 bg-white shadow-lg",

  // Modal/dialog overlay
  overlay: "bg-black/20 backdrop-blur-[1px]",

  // Card style (for panels, containers)
  card: "rounded-xl border border-gray-200 bg-white shadow-sm",

  // Arrow/pointer for tooltips
  arrow: "h-2 w-2 rotate-45 border border-gray-200 bg-white",
} as const;

/**
 * Change indicator badge (used in EntityDetail for review changes)
 */
export const CHANGE_INDICATOR = {
  badge: "bg-amber-500",
  badgeHover: "group-hover/change:scale-110 group-hover/change:shadow-md",
  tail: "border-r-amber-500",
} as const;

/**
 * Warning colors
 */
export const WARNING_THEME = {
  error: {
    bg: "bg-red-50",
    bgStrong: "bg-red-100",
    border: "border-red-200",
    text: "text-red-800",
    icon: "bg-red-100 text-red-600",
  },
  warning: {
    bg: "bg-amber-50",
    bgStrong: "bg-amber-100",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: "bg-amber-100 text-amber-600",
  },
  info: {
    bg: "bg-blue-50",
    bgStrong: "bg-blue-100",
    border: "border-blue-200",
    text: "text-blue-800",
    icon: "bg-blue-100 text-un-blue",
  },
} as const;

/**
 * Success/status colors
 */
export const STATUS_THEME = {
  success: {
    bg: "bg-green-50",
    bgStrong: "bg-green-100",
    border: "border-green-300",
    text: "text-green-700",
    icon: "bg-green-100 text-green-600",
  },
} as const;

/**
 * UN Blue brand color patterns
 * For primary actions, links, and brand elements
 */
export const UN_BLUE = {
  // Primary button (solid)
  button: "bg-un-blue-text text-white hover:bg-un-blue-shade",

  // Secondary button/badge (light background)
  badge: "bg-un-blue-surface text-un-blue-text hover:bg-un-blue-tint-50",

  // Info badge (subtle)
  badgeSubtle: "bg-un-blue-surface text-un-blue-text hover:bg-un-blue-tint-50",

  // Text link
  link: "text-un-blue-text hover:underline",

  // Icon background
  iconBg: "bg-un-blue-surface text-un-blue-text",
} as const;

/**
 * Helper function to get decision theme by decision type
 */
export function getDecisionTheme(decision: string | null | undefined) {
  if (!decision) return DECISION_THEME.default;

  const decisionLower = decision.toLowerCase();

  if (decisionLower === "retain") return DECISION_THEME.retain;
  if (decisionLower === "remove") return DECISION_THEME.remove;
  if (decisionLower === "update") return DECISION_THEME.update;
  if (decisionLower === "add") return DECISION_THEME.add;

  return DECISION_THEME.default;
}

/**
 * Helper function to get decision badge style string
 */
export function getDecisionBadgeStyle(decision: string | null | undefined) {
  if (!decision) return DECISION_BADGE_STYLES["no decision"];

  const decisionLower =
    decision.toLowerCase() as keyof typeof DECISION_BADGE_STYLES;

  return (
    DECISION_BADGE_STYLES[decisionLower] || DECISION_BADGE_STYLES["no decision"]
  );
}
