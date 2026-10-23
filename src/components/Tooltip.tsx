"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  isValidElement,
  cloneElement,
} from "react";
import { createPortal } from "react-dom";
import { POPUP_STYLES } from "@/lib/theme";

interface Props {
  content: string | React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: Props) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const side = rect.top < 80 ? "bottom" : "top";
    setPosition(side);
    setAnchor({
      left: rect.left + rect.width / 2,
      top: side === "top" ? rect.top - 6 : rect.bottom + 6,
    });
    setShow(true);
  }, []);

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
  }>(children)
    ? children
    : null;
  const interactiveChild =
    child &&
    ((typeof child.type === "string" &&
      ["button", "a", "input", "select", "textarea"].includes(child.type)) ||
      child.props.tabIndex !== undefined);
  const description = [child?.props["aria-describedby"], tooltipId]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      ref={triggerRef}
      className="relative inline-block max-w-full"
      tabIndex={interactiveChild ? undefined : 0}
      aria-describedby={interactiveChild ? undefined : tooltipId}
      onFocus={handleMouseEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setShow(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && show) {
          event.stopPropagation();
          setShow(false);
        }
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => {
        if (!triggerRef.current?.contains(document.activeElement))
          setShow(false);
      }}
    >
      {interactiveChild && child
        ? cloneElement(child, { "aria-describedby": description })
        : children}
      {show &&
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
            className={`pointer-events-none fixed z-[100] ${POPUP_STYLES.tooltipSize} rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-700 shadow-lg`}
          >
            {content}
            <span
              className={`absolute left-[var(--tooltip-arrow-left)] h-2 w-2 -translate-x-1/2 rotate-45 border border-gray-200 bg-white ${
                position === "top"
                  ? "top-full -mt-1 border-t-0 border-r border-b border-l-0"
                  : "bottom-full -mb-1 border-t border-r-0 border-b-0 border-l"
              }`}
            />
          </span>,
          document.body,
        )}
    </span>
  );
}
