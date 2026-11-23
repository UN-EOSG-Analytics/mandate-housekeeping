"use client";

import { useId, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { MandateWarning } from "@/features/mandates/services/mandate-warnings";
import {
  getCitationDropDescription,
  type CitationLocation,
} from "@/features/mandates/services/citation-locations";
import {
  getWarningIcon,
  getWarningSummary,
} from "@/features/mandates/services/mandate-warnings";
import {
  WARNING_THEME,
  DECISION_THEME,
  UN_BLUE,
  POPUP_STYLES,
} from "@/lib/theme";
import { ArrowLeftRight, ArrowRight, Search, X } from "lucide-react";
import { Button } from "@un-eosg/ui/components/button";
import { WarningIcon } from "./WarningIcon";
import { Tooltip } from "./Tooltip";
import { getDocumentComparisonUrl } from "@/features/mandates/services/documents/comparison-link";

interface WarningTooltipProps {
  warnings: MandateWarning[];
  children: React.ReactNode;
  onAction?: (warning: MandateWarning) => void;
  onPrimaryClick?: () => void;
  /** Eligibility is evaluated per saved location, independently of the row's addressed state. */
  canDropCitation?: (location: CitationLocation) => boolean;
  onDropCitation?: (location: CitationLocation) => Promise<boolean>;
  disabled?: boolean;
  /** Current document symbol for diff comparison */
  currentSymbol?: string;
}

const severityStyles = {
  error: {
    icon: WARNING_THEME.error.icon,
    border: WARNING_THEME.error.border,
    text: WARNING_THEME.error.text,
  },
  warning: {
    icon: WARNING_THEME.warning.icon,
    border: WARNING_THEME.warning.border,
    text: WARNING_THEME.warning.text,
  },
  info: {
    icon: WARNING_THEME.info.icon,
    border: WARNING_THEME.info.border,
    text: WARNING_THEME.info.text,
  },
};

const colorSchemeStyles = {
  red: WARNING_THEME.error.icon,
  amber: WARNING_THEME.warning.icon,
  blue: WARNING_THEME.info.icon,
};

export function WarningTooltip({
  warnings,
  children,
  onAction,
  onPrimaryClick,
  canDropCitation,
  onDropCitation,
  disabled,
  currentSymbol,
}: WarningTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropPending = useRef(false);
  const [dropping, setDropping] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  if (warnings.length === 0) return <>{children}</>;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    if (dropPending.current) return;
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onPrimaryClick && !disabled) {
      e.preventDefault();
      e.stopPropagation();
      onPrimaryClick();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        className={`${POPUP_STYLES.tooltipSize} overflow-hidden p-0`}
        side="top"
        sideOffset={8}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
          <h4 className="text-sm font-semibold text-foreground">
            {warnings.length === 1
              ? getWarningSummary(warnings[0])
              : `${warnings.length} citation notes`}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-foreground">
            These are review hints. If the citation is correct as it stands, you
            can keep it.
          </p>
        </div>
        <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
          {warnings.map((warning, index) => {
            const styles = severityStyles[warning.severity];
            const iconStyle = warning.colorScheme
              ? colorSchemeStyles[warning.colorScheme]
              : styles.icon;
            return (
              <div
                key={warning.id || index}
                className="px-3 py-2.5 transition-colors hover:bg-gray-50/50"
              >
                <div className="flex gap-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconStyle}`}
                  >
                    <WarningIcon
                      icon={warning.icon || getWarningIcon(warning.severity)}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    {warnings.length > 1 && (
                      <h5 className="mb-1 text-sm font-semibold text-foreground">
                        {getWarningSummary(warning)}
                      </h5>
                    )}
                    <p className="text-sm leading-relaxed text-gray-700">
                      {warning.message}
                      {warning.linkedYear && (
                        <>
                          {" "}
                          <span className="font-semibold">
                            {warning.linkedYear}
                          </span>
                        </>
                      )}
                      {warning.messageSuffix ? (
                        <> {warning.messageSuffix}</>
                      ) : warning.linkedSymbol ? (
                        ":"
                      ) : null}
                      {warning.linkedSymbol && (
                        <>
                          {" "}
                          <a
                            href={`https://docs.un.org/en/${warning.linkedSymbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-un-blue-text hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {warning.linkedSymbol}
                          </a>
                        </>
                      )}
                      {currentSymbol && warning.linkedSymbol && (
                        <Tooltip
                          asChild
                          content={`Compare ${currentSymbol} with ${warning.linkedSymbol} in a new tab`}
                        >
                          <a
                            href={getDocumentComparisonUrl(
                              currentSymbol,
                              warning.linkedSymbol,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Compare ${currentSymbol} with ${warning.linkedSymbol} in a new tab`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen(false);
                            }}
                            className={`ml-2 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-md border border-un-blue-text/25 px-2 text-xs font-medium shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2 ${UN_BLUE.badge}`}
                          >
                            <ArrowLeftRight
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            Compare
                          </a>
                        </Tooltip>
                      )}
                    </p>
                    {!!warning.locations?.length && (
                      <ul className="mt-2 space-y-1.5 text-xs text-foreground">
                        {warning.locations.map((location, index) => {
                          const target = location.target;
                          const key = target
                            ? JSON.stringify([
                                target.subprogramme,
                                target.sourceSymbol,
                              ])
                            : `${location.label}:${index}`;
                          const canDrop =
                            warning.id === "duplicate-citation" &&
                            target &&
                            onDropCitation &&
                            canDropCitation?.(target);
                          return (
                            <li
                              key={key}
                              className="border-b border-border pb-2 last:border-0 last:pb-0"
                            >
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium">
                                    {location.label}
                                    {location.isCurrent && (
                                      <span className="font-normal">
                                        {" "}
                                        (current)
                                      </span>
                                    )}
                                  </div>
                                  <div>{location.detail}</div>
                                </div>
                                {canDrop && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    disabled={dropping !== null}
                                    aria-describedby={`${tooltipId}-${warning.id}-${index}-drop`}
                                    aria-label={`Drop citation from ${location.label}${target.kind === "replacement" ? ` via update of ${target.sourceSymbol}` : ""}`}
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      if (dropPending.current) return;
                                      dropPending.current = true;
                                      setDropping(key);
                                      setDropError(null);
                                      try {
                                        if (!(await onDropCitation(target)))
                                          setDropError(
                                            "Could not drop this citation. Please try again.",
                                          );
                                      } catch {
                                        setDropError(
                                          "Could not drop this citation. Please try again.",
                                        );
                                      } finally {
                                        dropPending.current = false;
                                        setDropping(null);
                                      }
                                    }}
                                  >
                                    {dropping === key
                                      ? "Saving…"
                                      : "Drop citation"}
                                  </Button>
                                )}
                              </div>
                              {canDrop && (
                                <p
                                  id={`${tooltipId}-${warning.id}-${index}-drop`}
                                  className="mt-1 text-xs leading-relaxed text-foreground"
                                >
                                  {getCitationDropDescription(target)}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {warning.id === "duplicate-citation" && dropError && (
                      <p role="alert" className="mt-2 text-xs text-red-800">
                        {dropError}
                      </p>
                    )}
                    {warning.advice && (
                      <p className="mt-2 text-xs text-foreground">
                        {warning.advice}
                      </p>
                    )}
                    {warning.action && onAction && !disabled && (
                      <div className="mt-3 space-y-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            warning.action === "remove" ? "outline" : "default"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction(warning);
                            setOpen(false);
                          }}
                          className={`h-auto max-w-full cursor-pointer whitespace-normal py-1.5 text-xs shadow-sm ${
                            warning.action === "remove"
                              ? `${DECISION_THEME.remove.border} ${DECISION_THEME.remove.text} ${DECISION_THEME.remove.hoverBg}`
                              : UN_BLUE.button
                          }`}
                        >
                          {warning.action === "remove" ? (
                            <X className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Search className="size-3.5" aria-hidden="true" />
                          )}
                          {warning.actionLabel ??
                            (warning.action === "remove"
                              ? "Mark for removal"
                              : "Find replacement…")}
                          {warning.action === "update" && (
                            <ArrowRight
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                        <p className="text-xs leading-relaxed text-gray-600">
                          {warning.action === "remove"
                            ? "Records a Remove submission for this citation."
                            : warning.id === "missing-link"
                              ? "Search the UN Digital Library by symbol, or choose ‘Add manually’ to enter the document URL."
                              : "Search for a replacement or enter a document manually."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
