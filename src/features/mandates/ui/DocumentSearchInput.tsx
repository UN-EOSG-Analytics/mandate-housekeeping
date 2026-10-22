"use client";

import { useState, useEffect, useRef, useId } from "react";
import { Plus, Loader2, X, FileText } from "lucide-react";
import { ManualDocumentForm, type ManualEntryData } from "./ManualDocumentForm";
import type { DocumentSearchResult } from "@/features/mandates/services/documents/document-fetching";
import { useDocumentSearch } from "@/hooks/useDocumentSearch";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

type SearchResult = DocumentSearchResult;

interface Props {
  onSelect: (symbol: string) => void;
  onManualSubmit: (data: ManualEntryData) => void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  formTitle?: string;
  compact?: boolean;
  initialQuery?: string;
  originalTitle?: string;
  originalSymbol?: string;
}

export function DocumentSearchInput({
  onSelect,
  onManualSubmit,
  onCancel,
  placeholder,
  submitLabel,
  formTitle,
  compact,
  initialQuery,
  originalTitle,
  originalSymbol,
}: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [showManualForm, setShowManualForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const listId = useId();
  const { results, searching, searchDone, searchError, retry, invalidate } =
    useDocumentSearch(query, focused && !showManualForm);
  const hasManualOption = searchDone || searchError;
  const totalItems = results.length + (hasManualOption ? 1 : 0);
  const activeIndex =
    highlighted < 0
      ? totalItems
        ? 0
        : -1
      : Math.min(highlighted, totalItems - 1);
  const dropdownOpen =
    open && focused && (searching || searchDone || searchError);

  // Initial prefill is already in query state. A later explicit prefill must
  // update the visible text too; it previously searched the new value invisibly.
  const lastInitialQuery = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery === lastInitialQuery.current) return;
    const timer = setTimeout(() => {
      lastInitialQuery.current = initialQuery;
      invalidate();
      setQuery(initialQuery || "");
      setHighlighted(-1);
      inputRef.current?.focus();
      setOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialQuery, invalidate]);

  const handleInputChange = (value: string) => {
    invalidate();
    setQuery(value);
    setHighlighted(-1);
    setOpen(true);
  };

  const handleSelect = (doc: SearchResult) => {
    invalidate();
    onSelect(doc.symbol);
    setQuery("");
    setOpen(false);
    setHighlighted(-1);
  };

  const handleOpenManualForm = () => {
    invalidate();
    setShowManualForm(true);
    setFocused(false);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      invalidate();
      e.preventDefault();
      e.stopPropagation();
      if (!dropdownOpen) setQuery("");
      setOpen(false);
      setHighlighted(-1);
      onCancel?.();
      return;
    }
    if (!dropdownOpen || totalItems === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((activeIndex + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((activeIndex - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        } else if (
          activeIndex === results.length ||
          (results.length === 0 && activeIndex === 0)
        ) {
          handleOpenManualForm();
        }
        break;
    }
  };

  if (showManualForm) {
    return (
      <ManualDocumentForm
        onSubmit={(data) => {
          onManualSubmit(data);
          setShowManualForm(false);
          setQuery("");
        }}
        onSelect={(symbol) => {
          onSelect(symbol);
          setShowManualForm(false);
          setQuery("");
        }}
        onCancel={() => {
          setShowManualForm(false);
          onCancel?.();
        }}
        initialSymbol={query}
        submitLabel={submitLabel}
        formTitle={formTitle}
        compact={compact}
        originalTitle={originalTitle}
        originalSymbol={originalSymbol}
      />
    );
  }

  return (
    <Popover open={dropdownOpen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={containerRef} className="relative">
          <div className="flex items-center gap-3 py-2.5 pr-2 pl-3">
            <div
              className={`flex flex-1 items-center gap-2 rounded-lg border-2 border-dashed px-3 py-1.5 transition-colors ${
                focused
                  ? "border-un-blue/40 bg-blue-50/30"
                  : "border-gray-200 bg-gray-50/50"
              }`}
            >
              <Plus
                className={`h-4 w-4 ${focused ? "text-un-blue" : "text-gray-400"}`}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => {
                  invalidate();
                  setFocused(true);
                  setOpen(true);
                }}
                onBlur={() => {
                  invalidate();
                  setFocused(false);
                  setOpen(false);
                }}
                role="combobox"
                aria-label={placeholder || "Search by symbol or title"}
                aria-autocomplete="list"
                aria-expanded={dropdownOpen}
                aria-controls={dropdownOpen ? listId : undefined}
                aria-activedescendant={
                  dropdownOpen && activeIndex >= 0
                    ? `${listId}-${activeIndex}`
                    : undefined
                }
                onKeyDown={handleKeyDown}
                placeholder={placeholder || "Search by symbol or title..."}
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                autoFocus={compact || !!initialQuery}
              />
              {searching && (
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              )}
              {onCancel && (
                <button
                  type="button"
                  aria-label="Cancel document search"
                  onClick={() => {
                    invalidate();
                    setQuery("");
                    setOpen(false);
                    onCancel();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
              <div className="h-px w-4 bg-gray-300" />
              OR
              <div className="h-px w-4 bg-gray-300" />
            </div>

            <button
              type="button"
              onClick={handleOpenManualForm}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:border-un-blue/40 hover:bg-gray-50 hover:text-un-blue"
              title="Add document manually"
            >
              <FileText className="h-3.5 w-3.5" />
              Add manually
            </button>
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={8}
        className="max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-lg p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (containerRef.current?.contains(event.target as Node))
            event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Document search results"
          aria-busy={searching}
        >
          {searching && (
            <div role="status" className="px-3 py-2 text-sm text-foreground">
              Searching documents…
            </div>
          )}
          {searchError && (
            <div role="alert" className="px-3 py-2 text-sm text-foreground">
              Could not search documents.{" "}
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={retry}
                className="text-un-blue hover:underline"
              >
                Try again
              </button>
            </div>
          )}
          {results.map((doc, i) => (
            <button
              key={doc.symbol}
              type="button"
              role="option"
              id={`${listId}-${i}`}
              aria-selected={i === activeIndex}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(doc)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full border-b border-gray-100 px-3 py-2 text-left ${
                i === activeIndex ? "bg-un-blue/10" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-un-blue">
                  {doc.symbol}
                </span>
                <span className="text-xs text-gray-400">
                  {[doc.body, doc.year].filter(Boolean).join(" · ")}
                </span>
              </div>
              {doc.title && (
                <div className="mt-0.5 truncate text-xs text-gray-600">
                  {doc.title}
                </div>
              )}
            </button>
          ))}
          {searchDone && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">
              No documents found
            </div>
          )}
          {hasManualOption && (
            <button
              type="button"
              role="option"
              id={`${listId}-${results.length}`}
              aria-selected={activeIndex === results.length}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleOpenManualForm}
              onMouseEnter={() => setHighlighted(results.length)}
              className={`w-full border-t border-gray-100 px-3 py-2 text-left text-sm ${
                activeIndex === results.length
                  ? "bg-un-blue/10"
                  : "hover:bg-gray-50"
              }`}
            >
              <span className="text-un-blue">+ Add manually...</span>
              {query && (
                <span className="ml-1 text-gray-400">
                  &ldquo;{query}&rdquo;
                </span>
              )}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
