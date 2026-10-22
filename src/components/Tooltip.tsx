"use client";

import {
  useState,
  useRef,
  useCallback,
  useId,
  isValidElement,
  cloneElement,
} from "react";
import { POPUP_STYLES } from "@/lib/theme";

interface Props {
  content: string | React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: Props) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  // Calculate position when mouse enters - before showing
  const handleMouseEnter = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      // Vertical position
      setPosition(rect.top < 80 ? "bottom" : "top");

      // Horizontal alignment - estimate the shared 320px maximum width.
      const tooltipWidth =
        typeof content === "string"
          ? Math.min(320, content.length * 6 + 16)
          : 320;
      const centerX = rect.left + rect.width / 2;

      if (centerX - tooltipWidth / 2 < 8) {
        setAlign("left");
      } else if (centerX + tooltipWidth / 2 > viewportWidth - 8) {
        setAlign("right");
      } else {
        setAlign("center");
      }
    }
    setShow(true);
  }, [content]);

  const alignClasses = {
    left: "left-0",
    center: "left-1/2 -translate-x-1/2",
    right: "right-0",
  };

  const arrowAlignClasses = {
    left: "left-3",
    center: "left-1/2 -translate-x-1/2",
    right: "right-3",
  };

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
      {show && (
        <span
          id={tooltipId}
          role="tooltip"
          ref={tooltipRef}
          className={`absolute z-50 ${POPUP_STYLES.tooltipSize} rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs text-gray-700 shadow-lg ${alignClasses[align]} ${
            position === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {content}
          <span
            className={`absolute ${arrowAlignClasses[align]} h-2 w-2 rotate-45 border border-gray-200 bg-white ${
              position === "top"
                ? "top-full -mt-1 border-t-0 border-r border-b border-l-0"
                : "bottom-full -mb-1 border-t border-r-0 border-b-0 border-l"
            }`}
          />
        </span>
      )}
    </span>
  );
}
