"use client";

import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    <div className="inline-flex flex-col items-end">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={checking}
            aria-label={checking ? "Checking review status" : label}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-un-blue disabled:cursor-wait"
          >
            <Download className="h-3.5 w-3.5" />
            {checking ? "Checking review…" : label}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="min-w-52 rounded-lg bg-white shadow-lg"
        >
          {MODES.map((mode, index) => (
            <DropdownMenuGroup key={mode.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="px-3 pt-3 pb-1 text-xs font-semibold text-black">
                {mode.label}
              </DropdownMenuLabel>
              {FORMATS.map(({ id, label: formatLabel, icon: Icon }) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() => void download(id, mode.id)}
                  className="gap-2.5 px-3 py-2 text-sm text-black focus:bg-gray-50"
                >
                  <Icon className="h-4 w-4" />
                  {formatLabel}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
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
