"use client";

import * as React from "react";
import { typography } from "@un-eosg/ui/typography";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Decision,
  MandateDecision,
  DecisionChangeHandler,
  DecisionReasonChangeHandler,
} from "@/types";
import { ChevronDown, MessageCircle, Pencil } from "lucide-react";
import { DECISION_THEME, POPUP_STYLES } from "@/lib/theme";
import {
  ReasonPopup,
  getReasonDisplayLabel,
  renderReasonIcon,
  renderLabelWithBold,
} from "../features/mandates/ui/ReasonsModal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DecisionType } from "@/features/mandates/services/decision-reasons";

interface DecisionDropdownProps {
  decision: Decision | null;
  onChange: DecisionChangeHandler;
  onUpdateClick?: () => void;
  disabled?: boolean;
  locked?: boolean; // Prevents changing decision but keeps full styling (used for 'add' decisions)
  userEmail?: string | null;
  userEntity?: string | null;
  createdAt?: string | null;
  className?: string;
  size?: "sm" | "md";
  // Reason props for integrated popup
  reason?: string | null;
  otherReason?: string | null;
  onReasonChange?: DecisionReasonChangeHandler;
  symbol?: string;
  // External control of reason popup
  showReasonPopup?: boolean;
  onReasonPopupClose?: () => void;
}

// Shared color scheme for decisions - re-export from theme
export const DECISION_COLORS = DECISION_THEME;

/**
 * Shared decision dropdown component used across the app.
 * Supports "retain", "remove", "update", and canceling back to "—".
 * Integrated with reason popup that appears after making a decision.
 */
export function DecisionDropdown({
  decision,
  onChange,
  onUpdateClick,
  disabled: disabledProp,
  locked,
  userEmail,
  userEntity,
  createdAt,
  className,
  size = "md",
  reason,
  otherReason,
  onReasonChange,
  symbol,
  showReasonPopup: externalShowReasonPopup,
  onReasonPopupClose,
}: DecisionDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savingReason, setSavingReason] = React.useState(false);
  const [initialReasonDecision, setInitialReasonDecision] =
    React.useState<Decision | null>(null);
  const initialSaveRef = React.useRef<Promise<MandateDecision | null> | null>(
    null,
  );
  const reasonSavingRef = React.useRef(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const savingRef = React.useRef(false);
  const disabled = disabledProp || saving || savingReason;
  const [internalShowReasonPopup, setInternalShowReasonPopup] =
    React.useState(false);
  const [decisionTooltipOpen, setDecisionTooltipOpen] = React.useState(false);
  const [reasonTooltipOpen, setReasonTooltipOpen] = React.useState(false);
  const decisionTooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reasonTooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Show popup if either internal or external says to show it
  // (external is used for "update" flow, internal for "retain"/"remove")
  const showReasonPopup = externalShowReasonPopup || internalShowReasonPopup;
  const setShowReasonPopup = (value: boolean) => {
    setInternalShowReasonPopup(value);
    if (!value) {
      initialSaveRef.current = null;
      setInitialReasonDecision(null);
    }
    if (!value && onReasonPopupClose) {
      onReasonPopupClose();
    }
  };

  // Get reason display label for tooltip
  const reasonLabel =
    decision && decision !== "cancel"
      ? getReasonDisplayLabel(
          decision as DecisionType,
          reason ?? null,
          otherReason ?? null,
        )
      : null;

  const colors =
    decision && decision in DECISION_COLORS
      ? DECISION_COLORS[decision as keyof typeof DECISION_COLORS]
      : DECISION_COLORS.default;
  const sizeClasses =
    size === "sm" ? `h-6 ${typography.label}` : `h-6 ${typography.label}`;

  const handleSelect = async (value: Decision | "") => {
    if (disabled || savingRef.current || reasonSavingRef.current) return;
    setIsOpen(false);
    setSaveError(null);

    if (value === "update" && onUpdateClick) {
      onUpdateClick();
      return;
    }

    setShowReasonPopup(false);
    savingRef.current = true;
    setSaving(true);
    try {
      const pending = onChange(value || "cancel");
      if (value && value !== "cancel" && onReasonChange) {
        // Let the user choose immediately; the reason handler waits for this
        // exact event rather than relying on a later render's state/ID.
        initialSaveRef.current = pending;
        setInitialReasonDecision(value);
        setShowReasonPopup(true);
      }
      const saved = await pending;
      if (!saved) {
        setShowReasonPopup(false);
        setSaveError("Could not save the decision. Please try again.");
      }
    } catch {
      setShowReasonPopup(false);
      setSaveError("Could not save the decision. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleReasonChange = async (
    newReason: string | null,
    newOtherReason: string | null,
  ) => {
    const pending = initialSaveRef.current;
    if (!onReasonChange || reasonSavingRef.current || (!pending && disabled))
      return;
    reasonSavingRef.current = true;
    setSavingReason(true);
    setSaveError(null);
    try {
      const saved = pending ? await pending : undefined;
      if (pending && !saved) {
        setSaveError(
          "The decision was not saved, so its reason could not be saved.",
        );
        return;
      }
      if (
        !(await onReasonChange(newReason, newOtherReason, saved ?? undefined))
      ) {
        setSaveError("Could not save the reason. Please try again.");
      }
    } catch {
      setSaveError("Could not save the reason. Please try again.");
    } finally {
      reasonSavingRef.current = false;
      setSavingReason(false);
    }
  };

  const popupDecision = initialReasonDecision ?? decision;

  const displayLabel =
    decision && decision !== "cancel"
      ? decision.charAt(0).toUpperCase() + decision.slice(1)
      : "—";

  // For "add" decisions, only show the cancel option
  const options: { value: Decision | ""; label: string }[] =
    decision === "add"
      ? [{ value: "", label: "—" }]
      : [
          { value: "", label: "—" },
          { value: "retain", label: "Retain" },
          { value: "remove", label: "Remove" },
          { value: "update", label: "Update" },
        ];

  // Show indicator if reason is set
  const hasReason = reason && reason !== "";

  return (
    <DropdownMenu
      open={isOpen && !disabled && !locked}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) setDecisionTooltipOpen(false);
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        aria-busy={saving || savingReason}
        className="relative flex items-center gap-0.5"
      >
        {(saving || savingReason) && (
          <span role="status" className="sr-only">
            Saving…
          </span>
        )}
        {saveError && (
          <span role="alert" className="text-xs text-red-700">
            {saveError}
          </span>
        )}
        {/* Main decision dropdown button */}
        {decision && decision !== "cancel" && userEmail && createdAt ? (
          <Popover
            open={decisionTooltipOpen}
            onOpenChange={setDecisionTooltipOpen}
          >
            <PopoverTrigger asChild>
              <DropdownMenuTrigger asChild disabled={disabled || locked}>
                <button
                  aria-label={`Submission decision for ${symbol || "document"}: ${displayLabel}`}
                  onClick={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (decisionTooltipTimeoutRef.current)
                      clearTimeout(decisionTooltipTimeoutRef.current);
                    setDecisionTooltipOpen(true);
                  }}
                  onMouseLeave={() => {
                    decisionTooltipTimeoutRef.current = setTimeout(
                      () => setDecisionTooltipOpen(false),
                      150,
                    );
                  }}
                  disabled={disabled}
                  className={`flex w-21 items-center justify-between gap-1 rounded border px-2 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 ${sizeClasses} ${colors.bg} ${colors.border} ${colors.text} ${
                    disabled
                      ? "cursor-default"
                      : locked
                        ? "cursor-default"
                        : `cursor-pointer ${colors.hover}`
                  } ${className || ""}`}
                >
                  <span>
                    {saving || savingReason ? "Saving…" : displayLabel}
                  </span>
                  {!disabled && !locked && (
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                </button>
              </DropdownMenuTrigger>
            </PopoverTrigger>
            <PopoverContent
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className={`${POPUP_STYLES.tooltipSize} overflow-hidden p-0`}
              side="top"
              sideOffset={8}
              onMouseEnter={() => {
                if (decisionTooltipTimeoutRef.current)
                  clearTimeout(decisionTooltipTimeoutRef.current);
                setDecisionTooltipOpen(true);
              }}
              onMouseLeave={() => {
                decisionTooltipTimeoutRef.current = setTimeout(
                  () => setDecisionTooltipOpen(false),
                  150,
                );
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-foreground">
                  <span className={`font-medium ${colors.text}`}>
                    {displayLabel}
                  </span>
                  <span>by {userEmail}</span>
                  {userEntity && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-micro font-medium text-foreground">
                      {userEntity}
                    </span>
                  )}
                  <span>· {new Date(createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <DropdownMenuTrigger asChild disabled={disabled || locked}>
            <button
              aria-label={`Submission decision for ${symbol || "document"}: ${displayLabel}`}
              disabled={disabled || locked}
              className={`flex w-21 items-center justify-between gap-1 rounded border px-2 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 ${sizeClasses} ${colors.bg} ${colors.border} ${colors.text} ${
                disabled
                  ? "cursor-default"
                  : locked
                    ? "cursor-default"
                    : `cursor-pointer ${colors.hover}`
              } ${className || ""}`}
            >
              <span>{saving || savingReason ? "Saving…" : displayLabel}</span>
              {!disabled && !locked && (
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              )}
            </button>
          </DropdownMenuTrigger>
        )}

        {/* Reason indicator/edit button with hover tooltip */}
        {decision && decision !== "cancel" && onReasonChange && (
          <Popover open={reasonTooltipOpen} onOpenChange={setReasonTooltipOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={disabled}
                aria-label={`Edit reason for ${symbol || "document"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) setShowReasonPopup(true);
                }}
                onMouseEnter={() => {
                  if (reasonTooltipTimeoutRef.current)
                    clearTimeout(reasonTooltipTimeoutRef.current);
                  setReasonTooltipOpen(true);
                }}
                onMouseLeave={() => {
                  reasonTooltipTimeoutRef.current = setTimeout(
                    () => setReasonTooltipOpen(false),
                    150,
                  );
                }}
                className={`group/reason flex h-6 items-center justify-center rounded border transition-all ${
                  hasReason
                    ? `w-6 ${colors.bg} ${colors.border} ${colors.text} ${colors.hover}`
                    : "w-6 border-dashed border-gray-300 bg-white text-gray-400 hover:border-gray-400 hover:bg-gray-50"
                }`}
              >
                {hasReason ? (
                  reason ? (
                    renderReasonIcon(reason, "h-3.5 w-3.5")
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )
                ) : (
                  <Pencil className="h-3 w-3" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              className={`${POPUP_STYLES.tooltipSize} overflow-hidden p-0`}
              side="top"
              sideOffset={8}
              onMouseEnter={() => {
                if (reasonTooltipTimeoutRef.current)
                  clearTimeout(reasonTooltipTimeoutRef.current);
                setReasonTooltipOpen(true);
              }}
              onMouseLeave={() => {
                reasonTooltipTimeoutRef.current = setTimeout(
                  () => setReasonTooltipOpen(false),
                  150,
                );
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <h4 className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                  Reason
                </h4>
              </div>
              <div className="px-3 py-2.5">
                <div className="flex gap-2.5">
                  {reason && (
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${colors.bg} ${colors.text}`}
                    >
                      {renderReasonIcon(reason, "h-3.5 w-3.5")}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    {reasonLabel ? (
                      <p className="text-sm leading-relaxed text-foreground">
                        {renderLabelWithBold(reasonLabel)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No reason provided
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <DropdownMenuContent
          align="start"
          className="z-[100] min-w-21"
          onCloseAutoFocus={(event) => {
            // A selected decision opens a dialog; let that dialog own focus.
            if (initialSaveRef.current || showReasonPopup)
              event.preventDefault();
          }}
        >
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value || "empty"}
              onSelect={() => handleSelect(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>

        {/* Reason popup - appears after making a decision */}
        {popupDecision && popupDecision !== "cancel" && onReasonChange && (
          <ReasonPopup
            decision={popupDecision as DecisionType}
            reason={initialReasonDecision ? null : (reason ?? null)}
            otherReason={initialReasonDecision ? null : (otherReason ?? null)}
            onChange={handleReasonChange}
            onClose={() => setShowReasonPopup(false)}
            isOpen={
              showReasonPopup &&
              (!!initialReasonDecision || !disabled) &&
              !savingReason
            }
            symbol={symbol}
            onRestoreFocus={() => {
              // Saving may temporarily disable the original trigger. Its nearby
              // enabled reason control is an equally useful return point.
              const target =
                containerRef.current?.querySelector<HTMLButtonElement>(
                  "button:not(:disabled)",
                );
              (target ?? containerRef.current)?.focus();
            }}
          />
        )}
      </div>
    </DropdownMenu>
  );
}
