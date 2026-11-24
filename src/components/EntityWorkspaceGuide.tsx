"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ViewDetailsLabel } from "./ViewDetailsLabel";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@un-eosg/ui/components/button";
import { typography } from "@un-eosg/ui/typography";
import { cn } from "@/lib/utils";
import { SUBMISSION_CYCLES, type BudgetVersion } from "@/lib/db/budget-version";

interface Props {
  budgetVersion: BudgetVersion;
  canEditSubmission: boolean;
  cycleReadOnly?: boolean;
}

interface TourStep {
  target: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-view-details]",
    title: "Inspect the citation in View details",
    description:
      "Select View details to open the sidebar. Use Review for decisions and comments, or Document to check the source and read the available paragraphs.",
  },
  {
    target: "[data-workspace-search]",
    title: "Find a citation",
    description:
      "Search by document symbol, title, or body. The column headings also offer filters. Clear filters to return to the full list.",
  },
  {
    target: "[data-workspace-remaining]",
    title: "Focus on remaining decisions",
    description:
      "Show remaining hides citations with an entity submission decision. Your entity totals and decided progress stay visible as you narrow the list.",
  },
  {
    target:
      '[data-workspace-decision] button[aria-label^="Submission decision"]:not(:disabled)',
    title: "Record a decision for this citation",
    description:
      "Choose the appropriate decision in this row. The same document can appear in several programme locations, each with its own decision. Changes save automatically; check the saving status before leaving.",
  },
  {
    target: "[data-workspace-add]",
    title: "Add a citation in the right location",
    description:
      "Use Add citation in the relevant programme or subprogramme section. Find the document and choose it for that section.",
  },
  {
    target: "[data-workspace-export] button",
    title: "Review your saved work",
    description:
      "Download an entity submission export whenever you need a copy of your saved decisions. Decisions are already saved automatically in this workspace.",
  },
];

function visibleTarget(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(
    (target) => target.getClientRects().length > 0,
  );
}

interface TourRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface TourLayout {
  spotlight: TourRect | null;
  card: { left: number; top: number; width: number; maxHeight: number };
  viewport: TourRect;
}

function placeTour(
  target: HTMLElement,
  card: HTMLElement,
  viewport: TourRect,
): TourLayout {
  const { width, height } = viewport;
  const viewportRight = viewport.left + width;
  const viewportBottom = viewport.top + height;
  const margin = 12;
  const gap = 16;
  const padding = 7;
  const cardWidth = Math.min(368, width - margin * 2);
  const description = card.querySelector<HTMLElement>(
    "[data-tour-description]",
  );
  const naturalHeight =
    card.scrollHeight +
    (description ? description.scrollHeight - description.clientHeight : 0);
  const cardHeight = Math.min(naturalHeight, height - margin * 2);
  const targetRect = target.getBoundingClientRect();
  const left = Math.max(viewport.left + margin / 2, targetRect.left - padding);
  const top = Math.max(viewport.top + margin / 2, targetRect.top - padding);
  const right = Math.min(
    viewportRight - margin / 2,
    targetRect.right + padding,
  );
  const bottom = Math.min(
    viewportBottom - margin / 2,
    targetRect.bottom + padding,
  );
  const spotlight =
    right > left && bottom > top
      ? { left, top, width: right - left, height: bottom - top }
      : null;
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));
  const centeredX = clamp(
    (left + right - cardWidth) / 2,
    viewport.left + margin,
    viewportRight - margin - cardWidth,
  );
  const centeredY = clamp(
    (top + bottom - cardHeight) / 2,
    viewport.top + margin,
    viewportBottom - margin - cardHeight,
  );
  const candidates = [
    {
      left: centeredX,
      top: bottom + gap,
      space: viewportBottom - margin - bottom - gap,
      vertical: true,
    },
    {
      left: centeredX,
      top: top - gap - cardHeight,
      space: top - viewport.top - margin - gap,
      vertical: true,
    },
    {
      left: right + gap,
      top: centeredY,
      space: viewportRight - margin - right - gap,
      vertical: false,
    },
    {
      left: left - gap - cardWidth,
      top: centeredY,
      space: left - viewport.left - margin - gap,
      vertical: false,
    },
  ];
  const fitting =
    spotlight &&
    candidates.find(
      (candidate) =>
        candidate.space >= (candidate.vertical ? cardHeight : cardWidth),
    );
  if (fitting)
    return {
      spotlight,
      card: {
        left: fitting.left,
        top: fitting.top,
        width: cardWidth,
        maxHeight: height - margin * 2,
      },
      viewport,
    };
  // Constrain a nearby card on short screens instead of covering the target.
  const below = viewportBottom - margin - bottom - gap;
  const above = top - viewport.top - margin - gap;
  const available = Math.max(above, below);
  if (spotlight && available > 0) {
    const maxHeight = Math.min(height - margin * 2, available);
    return {
      spotlight,
      card: {
        left: centeredX,
        top:
          below >= above
            ? bottom + gap
            : Math.max(
                viewport.top + margin,
                top - gap - Math.min(cardHeight, maxHeight),
              ),
        width: cardWidth,
        maxHeight,
      },
      viewport,
    };
  }
  return {
    spotlight,
    card: {
      left: centeredX,
      top: clamp(
        viewportBottom - margin - cardHeight,
        viewport.top + margin,
        viewportBottom - margin - cardHeight,
      ),
      width: cardWidth,
      maxHeight: height - margin * 2,
    },
    viewport,
  };
}

export function EntityWorkspaceGuide({
  budgetVersion,
  canEditSubmission,
  cycleReadOnly = false,
}: Props) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const tourTitleRef = useRef<HTMLHeadingElement>(null);
  const tourCardRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusedStep = useRef<TourStep | null>(null);
  const [layout, setLayout] = useState<TourLayout | null>(null);
  const guidanceTitleId = useId();
  const tourTitleId = useId();
  const tourDescriptionId = useId();
  const spotlightMaskId = `workspace-tour-${useId().replaceAll(":", "")}`;
  const step = steps[stepIndex];

  useLayoutEffect(() => {
    if (!step) return;
    const target = visibleTarget(step.target);
    const card = tourCardRef.current;
    const overlay = overlayRef.current;
    if (!target || !card || !overlay) {
      closeTour();
      return;
    }
    let frame = 0;
    target.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
    const viewport = overlay.getBoundingClientRect();
    card.style.width = `${Math.min(368, viewport.width - 24)}px`;
    const initial = placeTour(target, card, viewport);
    if (initial.card.maxHeight < 280) {
      const stickyTable =
        window.matchMedia("(min-width: 1024px)").matches &&
        target.closest('[role="table"]');
      const headerHeight =
        parseFloat(
          getComputedStyle(document.documentElement).scrollPaddingTop,
        ) || 0;
      const desiredTop = headerHeight + (stickyTable ? 128 : 24);
      window.scrollBy({
        top: target.getBoundingClientRect().top - desiredTop,
        behavior: "instant",
      });
    }
    const measure = () => {
      if (!target.isConnected || target.getClientRects().length === 0) {
        closeTour();
        return;
      }
      setLayout(placeTour(target, card, overlay.getBoundingClientRect()));
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeTour();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...card!.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === tourTitleRef.current ||
          !card!.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !card!.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    }
    const keepFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !card.contains(event.target))
        tourTitleRef.current?.focus({ preventScroll: true });
    };
    const mutationObserver = new MutationObserver(() => {
      if (!target.isConnected || target.getClientRects().length === 0)
        closeTour();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
    const observer = new ResizeObserver(update);
    observer.observe(target);
    observer.observe(card);
    observer.observe(overlay);
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update, { passive: true });
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", keepFocus);
    };
    // closeTour restores the stable launch button; step changes remeasure and refocus.
  }, [step]);

  useLayoutEffect(() => {
    if (step && layout && focusedStep.current !== step) {
      tourTitleRef.current?.focus({ preventScroll: true });
      focusedStep.current = step;
    }
  }, [step, layout]);

  function closeTour() {
    setSteps([]);
    setLayout(null);
    focusedStep.current = null;
    requestAnimationFrame(() => {
      helpButtonRef.current?.focus({ preventScroll: true });
      helpButtonRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    });
  }

  function startTour() {
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    const available = TOUR_STEPS.filter((candidate) => {
      if (
        !canEditSubmission &&
        (candidate.target.startsWith("[data-workspace-decision]") ||
          candidate.target === "[data-workspace-add]")
      ) {
        return false;
      }
      return !!visibleTarget(candidate.target);
    });
    setStepIndex(0);
    setSteps(available);
  }

  return (
    <section
      aria-labelledby={guidanceTitleId}
      className="space-y-2 rounded-lg border border-un-blue-tint bg-un-blue-tint-50 p-4"
    >
      <h2 id={guidanceTitleId} className={typography.subTitle}>
        How to review
      </h2>
      <p className={cn(typography.body, "text-foreground")}>
        Use the <ViewDetailsLabel /> button at the right of a row to inspect its
        document and citation details.
      </p>
      <p className={cn(typography.body, "mt-1 text-foreground")}>
        {canEditSubmission
          ? "These citations come from the previous budget. Choose an action for each citation in each section where it appears. Your decisions save automatically."
          : cycleReadOnly
            ? `Submissions for PPB ${SUBMISSION_CYCLES[budgetVersion].year} are read-only. Browse citations and export saved decisions for reference. Select the active cycle to continue housekeeping.`
            : "Entity members edit their own submissions; reviewers record their review in a separate track. Inspect each citation in its programme location."}
      </p>
      <Button
        ref={helpButtonRef}
        type="button"
        variant="ghost"
        size="xs"
        onClick={startTour}
        className="-ml-1.5 text-foreground"
      >
        <CircleHelp aria-hidden="true" />
        Workspace tour
      </Button>
      {step &&
        createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-[80]"
            data-workspace-tour-overlay
          >
            {layout && (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <defs>
                  <mask id={spotlightMaskId} maskUnits="userSpaceOnUse">
                    <rect
                      width={layout.viewport.width}
                      height={layout.viewport.height}
                      fill="white"
                    />
                    {layout.spotlight && (
                      <rect
                        x={layout.spotlight.left - layout.viewport.left}
                        y={layout.spotlight.top - layout.viewport.top}
                        width={layout.spotlight.width}
                        height={layout.spotlight.height}
                        rx="7"
                        fill="black"
                      />
                    )}
                  </mask>
                </defs>
                <rect
                  width={layout.viewport.width}
                  height={layout.viewport.height}
                  fill="rgb(0 0 0 / 0.58)"
                  mask={`url(#${spotlightMaskId})`}
                />
              </svg>
            )}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              onClick={closeTour}
            />
            {layout?.spotlight && (
              <div
                aria-hidden="true"
                className="pointer-events-auto fixed rounded-lg border-2 border-white shadow-[0_0_0_2px_var(--color-un-blue-text)]"
                style={{ ...layout.spotlight }}
              />
            )}
            <section
              ref={tourCardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={tourTitleId}
              aria-describedby={tourDescriptionId}
              className="fixed flex flex-col overflow-y-auto rounded-lg border border-border bg-white p-4 shadow-xl"
              style={
                layout
                  ? { ...layout.card, visibility: "visible" }
                  : {
                      left: 12,
                      top: 12,
                      width: Math.min(
                        368,
                        document.documentElement.clientWidth - 24,
                      ),
                      maxHeight: document.documentElement.clientHeight - 24,
                      visibility: "hidden",
                    }
              }
            >
              <div className="flex shrink-0 items-start justify-between gap-3">
                <p className={cn(typography.caption, "text-foreground")}>
                  Workspace tour · {stepIndex + 1} of {steps.length}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={closeTour}
                  aria-label="Close workspace tour"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <h2
                ref={tourTitleRef}
                id={tourTitleId}
                tabIndex={-1}
                className={cn(
                  typography.subTitle,
                  "mt-1 shrink-0 focus:outline-none",
                )}
              >
                {step.title}
              </h2>
              <p
                data-tour-description
                tabIndex={0}
                id={tourDescriptionId}
                className={cn(
                  typography.body,
                  "mt-2 min-h-0 overflow-y-auto text-foreground focus-visible:rounded focus-visible:outline-2 focus-visible:outline-un-blue",
                )}
              >
                {step.description}
              </p>
              <div className="mt-4 flex shrink-0 items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex(stepIndex - 1)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (stepIndex === steps.length - 1) closeTour();
                    else setStepIndex(stepIndex + 1);
                  }}
                >
                  {stepIndex === steps.length - 1 ? "Finish tour" : "Next"}
                </Button>
              </div>
              <p
                className={cn(
                  typography.caption,
                  "mt-3 shrink-0 text-foreground",
                )}
              >
                Use Tab to reach the controls. Escape closes the tour.
              </p>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
