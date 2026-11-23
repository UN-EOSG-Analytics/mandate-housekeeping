"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  isValidElement,
  cloneElement,
  type HTMLAttributes,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { POPUP_STYLES } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface Props extends Omit<
  HTMLAttributes<HTMLElement>,
  "content" | "children"
> {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Compose onto the existing trigger without changing its layout. */
  asChild?: boolean;
  ref?: Ref<HTMLElement>;
}

export function Tooltip({
  content,
  children,
  asChild = false,
  ref: forwardedRef,
  className,
  tabIndex,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onKeyDown,
  "aria-describedby": describedBy,
  ...triggerProps
}: Props) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLElement>(null);
  const enabled = content !== undefined && content !== null && content !== "";
  const setTriggerRef = useCallback(
    (node: HTMLElement | null) => {
      triggerRef.current = node;
      if (typeof forwardedRef === "function") {
        const cleanup = forwardedRef(node);
        return () => {
          triggerRef.current = null;
          if (cleanup) cleanup();
          else forwardedRef(null);
        };
      }
      if (forwardedRef) forwardedRef.current = node;
      return () => {
        triggerRef.current = null;
        if (forwardedRef) forwardedRef.current = null;
      };
    },
    [forwardedRef],
  );

  const handleMouseEnter = useCallback(() => {
    if (!enabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const side = rect.top < 80 ? "bottom" : "top";
    setPosition(side);
    setAnchor({
      left: rect.left + rect.width / 2,
      top: side === "top" ? rect.top - 6 : rect.bottom + 6,
    });
    setShow(true);
  }, [enabled]);

  // A portalled tooltip must not stay behind when its scroll container moves.
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [show]);

  const measureTooltip = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const width = node.getBoundingClientRect().width;
      const left = Math.max(
        8 + width / 2,
        Math.min(anchor.left, window.innerWidth - 8 - width / 2),
      );
      node.style.left = left + "px";
      node.style.setProperty(
        "--tooltip-arrow-left",
        anchor.left - left + width / 2 + "px",
      );
    },
    [anchor.left],
  );

  const child = isValidElement<{
    "aria-describedby"?: string;
    tabIndex?: number;
    onClick?: unknown;
    href?: string;
    type?: string;
  }>(children)
    ? children
    : null;
  const interactiveChild =
    child &&
    ((typeof child.type === "string" &&
      ["button", "a", "input", "select", "textarea"].includes(child.type)) ||
      child.props.tabIndex !== undefined ||
      child.props.onClick ||
      child.props.href ||
      child.props.type === "button" ||
      triggerProps.onClick);
  const description =
    [
      child?.props["aria-describedby"],
      describedBy,
      enabled && show ? tooltipId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const Trigger = asChild ? Slot : "span";

  return (
    <>
      <Trigger
        {...triggerProps}
        ref={setTriggerRef}
        className={
          asChild
            ? className
            : cn("relative inline-block max-w-full", className)
        }
        tabIndex={tabIndex ?? (enabled && !interactiveChild ? 0 : undefined)}
        aria-describedby={
          asChild || !interactiveChild ? description : undefined
        }
        onFocus={(event) => {
          onFocus?.(event);
          if (!event.defaultPrevented) handleMouseEnter();
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (!event.currentTarget.contains(event.relatedTarget))
            setShow(false);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === "Escape" && show) {
            event.stopPropagation();
            setShow(false);
          }
        }}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          if (!event.defaultPrevented && event.pointerType !== "touch")
            handleMouseEnter();
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          if (!triggerRef.current?.contains(document.activeElement))
            setShow(false);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          setShow(false);
        }}
      >
        {(asChild || interactiveChild) && child
          ? cloneElement(child, { "aria-describedby": description })
          : children}
      </Trigger>
      {show &&
        enabled &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            ref={measureTooltip}
            style={{
              left: anchor.left,
              top: anchor.top,
              transform:
                position === "top"
                  ? "translate(-50%, -100%)"
                  : "translateX(-50%)",
            }}
            className={`pointer-events-none fixed z-[100] ${POPUP_STYLES.tooltipSize} rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-foreground shadow-lg`}
          >
            {content}
            <span
              aria-hidden="true"
              className={`absolute left-[var(--tooltip-arrow-left)] h-2 w-2 -translate-x-1/2 rotate-45 border border-gray-200 bg-white ${
                position === "top"
                  ? "top-full -mt-1 border-t-0 border-r border-b border-l-0"
                  : "bottom-full -mb-1 border-t border-r-0 border-b-0 border-l"
              }`}
            />
          </span>,
          document.body,
        )}
    </>
  );
}
