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
  onChange: (
    reason: string | null,
    otherReason: string | null,
  ) => Promise<boolean>;
  onClose: () => void;
  isOpen: boolean;
  symbol?: string;
  onRestoreFocus?: () => void;
  saving?: boolean;
  error?: string | null;
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
  saving = false,
  error,
}: ReasonPopupProps) {
  const [localOtherReason, setLocalOtherReason] = React.useState(
    otherReason ?? "",
  );
  const [localReason, setLocalReason] = React.useState<string | null>(reason);
  const wasOpen = React.useRef(false);

  const reasons = getReasonsForDecision(decision);

  // Get icon for a reason ID
  const getIconForReason = (reasonId: string) => {
    const IconComponent = REASON_ICONS[reasonId] || MessageSquare;
    return <IconComponent className="h-4 w-4" />;
  };

  // Sync local state with props
  React.useEffect(() => {
    if (isOpen && !wasOpen.current) {
      // Initialize a newly opened editor; retain drafts while saving.
      setLocalOtherReason(otherReason ?? "");
      setLocalReason(reason);
    }
    wasOpen.current = isOpen;
  }, [isOpen, otherReason, reason]);

  const handleReasonSelect = async (reasonId: string) => {
    if (saving) return;
    setLocalReason(reasonId);
    if (reasonId === "other") {
      // Set local state to show textarea, but don't persist yet
      // Save when the user confirms the text or presses Enter.
    } else {
      if (await onChange(reasonId, null)) onClose();
    }
  };

  const handleOtherReasonChange = (text: string) => {
    setLocalOtherReason(text);
  };

  const handleOtherSubmit = async () => {
    if (saving) return;
    if (await onChange("other", localOtherReason || null)) onClose();
  };

  const decisionLabel = decision.charAt(0).toUpperCase() + decision.slice(1);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
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
            disabled={saving}
            aria-label="Close reason selection"
            className="rounded p-1 text-foreground transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {saving && (
          <p role="status" className="px-4 py-2 text-sm text-un-blue-text">
            Saving…
          </p>
        )}
        {error && (
          <div className="px-4 py-2 text-sm text-red-700">
            <p role="alert">{error} Your reason is preserved.</p>
            {localReason && localReason !== "other" && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleReasonSelect(localReason)}
                className="mt-1 underline underline-offset-2"
              >
                Retry save reason
              </button>
            )}
          </div>
        )}

        {/* Options */}
        <div className="max-h-[70vh] scrollbar-thin overflow-y-auto py-1">
          {reasons.map((r, index) => (
            <button
              key={r.id}
              onClick={() => void handleReasonSelect(r.id)}
              disabled={saving}
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
              aria-label="Other reason"
              disabled={saving}
              value={localOtherReason}
              onChange={(e) => handleOtherReasonChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleOtherSubmit();
                }
              }}
              placeholder="Please specify the reason..."
              className={cn(
                typography.body,
                "w-full resize-none rounded border border-border px-3 py-2 text-foreground placeholder:text-gray-600 focus-visible:border-un-blue focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
              rows={3}
              autoFocus
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => void handleOtherSubmit()}
                disabled={saving}
                className={cn(
                  typography.label,
                  "rounded bg-un-blue-surface px-4 py-2 text-un-blue-text-aaa transition-colors hover:bg-un-blue/20 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 focus-visible:outline-none",
                )}
              >
                {saving
                  ? "Saving…"
                  : error
                    ? "Retry save reason"
                    : "Save reason"}
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
