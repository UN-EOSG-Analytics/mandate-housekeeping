"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep sticky rows and scroll targets below the header when its navigation wraps. */
export function HeaderHeight() {
  const marker = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const header = marker.current?.closest("header");
    if (!header) return;

    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(
        "--site-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--site-header-height");
    };
  }, []);

  return <span ref={marker} hidden />;
}
