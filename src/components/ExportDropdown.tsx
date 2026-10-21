"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download,
  ChevronDown,
  Table,
  FileSpreadsheet,
  FileType,
} from "lucide-react";
import type { ExportDecisionMode } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  entity?: string;
  label?: string;
}

const FORMATS = [
  { id: "docx", label: "Word", icon: FileType },
  { id: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { id: "csv", label: "CSV", icon: Table },
] as const;
const MODES: { id: ExportDecisionMode; label: string }[] = [
  { id: "entity", label: "Entity submission" },
  { id: "reviewed", label: "Reviewed outcome" },
];

export function ExportDropdown({ entity, label = "Export Mandates" }: Props) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    href: string;
    count: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const basePath = entity
    ? `/api/export/${encodeURIComponent(entity)}`
    : "/api/export/all";

  async function download(format: string, mode: ExportDecisionMode) {
    const href = `${basePath}/${format}?mode=${mode}`;
    setOpen(false);
    setError(null);
    if (mode === "entity") {
      window.location.assign(href);
      return;
    }
    setChecking(true);
    try {
      const response = await fetch(`${href}&notice=1`, { cache: "no-store" });
      if (!response.ok)
        throw new Error("Could not check review status. Please try again.");
      const result: { fallbackCount: number } = await response.json();
      if (result.fallbackCount > 0)
        setPending({ href, count: result.fallbackCount });
      else window.location.assign(href);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not prepare export.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div ref={ref} className="relative inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={checking}
        aria-expanded={open}
        aria-label={checking ? "Checking review status" : label}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-un-blue disabled:cursor-wait"
      >
        <Download className="h-3.5 w-3.5" />
        {checking ? "Checking review…" : label}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 z-10 mt-2 min-w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {MODES.map((mode) => (
            <div key={mode.id}>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-black">
                {mode.label}
              </p>
              {FORMATS.map(({ id, label: formatLabel, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void download(id, mode.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-black hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-un-blue"
                >
                  <Icon className="h-4 w-4" />
                  {formatLabel}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 max-w-64 text-xs text-red-700">
          {error}
        </p>
      )}
      <Dialog
        open={pending !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPending(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Export includes unreviewed submissions</DialogTitle>
          <DialogDescription className="text-black">
            {pending?.count}{" "}
            {pending?.count === 1 ? "submission has" : "submissions have"} not
            been reviewed. This export includes their entity-submitted
            decisions. Submissions changed since review are also included as
            unreviewed.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            {pending && (
              <Button asChild>
                <a
                  href={pending.href}
                  download
                  onClick={() => setPending(null)}
                >
                  Download reviewed outcome
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
