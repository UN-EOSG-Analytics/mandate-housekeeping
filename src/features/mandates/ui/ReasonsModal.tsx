"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  getReasonsForDecision,
  getReasonLabel,
  type DecisionType,
} from "@/features/mandates/services/decision-reasons";
import { typography } from "@un-eosg/ui/typography";
import { cn } from "@/lib/utils";
import { POPUP_STYLES } from "@/lib/theme";
import {
  X,
  Check,
  CheckCircle2,
  Building2,
  RefreshCw,
  Replace,
  Layers,
  Package,
  Building,
  MessageSquare,
  Lightbulb,
  Users,
} from "lucide-react";

interface ReasonPopupProps {
  decision: DecisionType;
  reason: string | null;
  otherReason: string | null;
  onChange: (reason: string | null, otherReason: string | null) => void;
  onClose: () => void;
  isOpen: boolean;
  symbol?: string;
}

/**
 * Parse a label with **bold** markers and render as React nodes
 */
export function renderLabelWithBold(label: string): React.ReactNode {
  const parts = label.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-semibold">
          {part.slice(2, -2)}
        </span>
      );
    }
    return part;
  });
}

// Exported icon mapping for use in other components
const REASON_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  // Add & Retain reasons
  direct_request: CheckCircle2,
  influences_work: Lightbulb,
  foundational: Building2,
  foundational_amend: Building2,
  // Update reasons
  superseded_identical: Replace,
  superseded_different: RefreshCw,
  // Remove reasons
  delivered: Package,
  other_entity_advantage: Users,
  subsidiary_removed: Building,
  consolidated: Layers,
  // Other
  other: MessageSquare,
};

/**
 * Get the icon component for a reason ID
 */
export function getReasonIcon(
  reasonId: string | null,
): React.ComponentType<{ className?: string }> | null {
  if (!reasonId) return null;
  return REASON_ICONS[reasonId] || MessageSquare;
}

/**
 * Render a reason icon as a React node
 */
export function renderReasonIcon(
  reasonId: string | null,
  className?: string,
): React.ReactNode {
  if (!reasonId) return null;
  const IconComponent = REASON_ICONS[reasonId] || MessageSquare;
  return <IconComponent className={className} />;
}

/**
 * Modal dialog for selecting a reason after a decision has been made.
 * Renders centered on screen with a backdrop.
 */
export function ReasonPopup({
  decision,
  reason,
  otherReason,
  onChange,
  onClose,
  isOpen,
  symbol,
}: ReasonPopupProps) {
  const [localOtherReason, setLocalOtherReason] = React.useState(
    otherReason ?? "",
  );
  const [localReason, setLocalReason] = React.useState<string | null>(reason);
  const [mounted, setMounted] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const reasons = getReasonsForDecision(decision);

  // Get icon for a reason ID
  const getIconForReason = (reasonId: string) => {
    const IconComponent = REASON_ICONS[reasonId] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

  // Client-side only rendering for portal
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open (comprehensive solution for all browsers including iOS)
  React.useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const originalStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    // Apply scroll lock
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      // Restore original styles
      document.body.style.overflow = originalStyles.overflow;
      document.body.style.position = originalStyles.position;
      document.body.style.top = originalStyles.top;
      document.body.style.width = originalStyles.width;
      // Restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Close on escape key
  React.useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Sync local state with props
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOtherReason(otherReason ?? "");
    setLocalReason(reason);
  }, [otherReason, reason]);

  const handleReasonSelect = (reasonId: string) => {
    if (reasonId === "other") {
      // Set local state to show textarea, but don't persist yet
      // The onChange will be called in handleOtherSubmit when user clicks Done or presses Enter
      setLocalReason("other");
    } else {
      onChange(reasonId, null);
      onClose();
    }
  };

  const handleOtherReasonChange = (text: string) => {
    setLocalOtherReason(text);
  };

  const handleOtherSubmit = () => {
    onChange("other", localOtherReason || null);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  const decisionLabel = decision.charAt(0).toUpperCase() + decision.slice(1);

  const modal = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${POPUP_STYLES.overlay}`}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        className={`mx-4 max-w-lg animate-in ${POPUP_STYLES.popup} shadow-xl duration-150 zoom-in-95 fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-lg border-b border-border bg-un-blue-surface px-4 py-3">
          <span className={cn(typography.body, "font-medium text-foreground")}>
            Why {decisionLabel.toLowerCase()}
            {symbol && <span className="font-semibold"> {symbol}</span>}?
          </span>
          <button
            onClick={onClose}
            aria-label="Close reason selection"
            className="rounded p-1 text-foreground transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Options */}
        <div className="max-h-[70vh] scrollbar-thin overflow-y-auto py-1">
          {reasons.map((r, index) => (
            <button
              key={r.id}
              onClick={() => handleReasonSelect(r.id)}
              aria-pressed={localReason === r.id}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:outline-none focus-visible:ring-inset",
                index !== reasons.length - 1 && "border-b border-border/50",
                localReason === r.id
                  ? "bg-un-blue-surface"
                  : "hover:bg-secondary",
              )}
            >
              <span className="mt-1 shrink-0 text-un-blue-text">
                {getIconForReason(r.id)}
              </span>
              <span className={cn(typography.body, "flex-1")}>
                {renderLabelWithBold(r.label)}
              </span>
              {localReason === r.id && (
                <Check
                  aria-hidden="true"
                  className="mt-1 h-4 w-4 shrink-0 text-un-blue-text"
                />
              )}
            </button>
          ))}
        </div>

        {/* Other reason freetext input */}
        {localReason === "other" && (
          <div className="border-t border-gray-100 p-4">
            <textarea
              value={localOtherReason}
              onChange={(e) => handleOtherReasonChange(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleOtherSubmit()
              }
              placeholder="Please specify the reason..."
              className={cn(
                typography.body,
                "w-full resize-none rounded border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:border-un-blue focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
              rows={3}
              autoFocus
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleOtherSubmit}
                className={cn(
                  typography.label,
                  "rounded bg-un-blue-surface px-4 py-2 text-un-blue-text transition-colors hover:bg-un-blue/20 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none",
                )}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/**
 * Get the display label for a reason (for use in tooltips)
 */
export function getReasonDisplayLabel(
  decision: DecisionType,
  reasonId: string | null,
  otherReason: string | null,
): string | null {
  if (!reasonId) return null;
  if (reasonId === "other" && otherReason) return otherReason;
  return getReasonLabel(decision, reasonId);
}
