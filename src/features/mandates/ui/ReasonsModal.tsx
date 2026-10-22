"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  getReasonsForDecision,
  getReasonLabel,
  type DecisionType,
} from "@/features/mandates/services/decision-reasons";
import { typography } from "@un-eosg/ui/typography";
import { cn } from "@/lib/utils";
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
  onRestoreFocus?: () => void;
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
  onRestoreFocus,
}: ReasonPopupProps) {
  const [localOtherReason, setLocalOtherReason] = React.useState(
    otherReason ?? "",
  );
  const [localReason, setLocalReason] = React.useState<string | null>(reason);

  const reasons = getReasonsForDecision(decision);

  // Get icon for a reason ID
  const getIconForReason = (reasonId: string) => {
    const IconComponent = REASON_ICONS[reasonId] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

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

  const decisionLabel = decision.charAt(0).toUpperCase() + decision.slice(1);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 text-left sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-lg border-b border-border bg-un-blue-surface px-4 py-3">
          <DialogTitle
            className={cn(typography.body, "font-medium text-foreground")}
          >
            Why {decisionLabel.toLowerCase()}
            {symbol && <span className="font-semibold"> {symbol}</span>}?
          </DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
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
