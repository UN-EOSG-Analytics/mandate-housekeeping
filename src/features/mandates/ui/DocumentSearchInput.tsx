"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Loader2, X, FileText } from "lucide-react";
import { ManualDocumentForm, type ManualEntryData } from "./ManualDocumentForm";
import {
  searchDocumentsAction,
  type DocumentSearchResult,
} from "@/features/mandates/services/documents/document-fetching";

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
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [showManualForm, setShowManualForm] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback((q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setSearchDone(false);
      return;
    }
    setSearching(true);
    setSearchDone(false);
    searchDocumentsAction(q)
      .then((data: SearchResult[]) => {
        // Sort results to prioritize exact matches and shorter symbols
        const sortedData = [...data].sort((a, b) => {
          const aSymbol = a.symbol.toUpperCase();
          const bSymbol = b.symbol.toUpperCase();
          const queryUpper = q.toUpperCase();

          // Exact match comes first
          const aExact = aSymbol === queryUpper;
          const bExact = bSymbol === queryUpper;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          // Starts with query comes next
          const aStarts = aSymbol.startsWith(queryUpper);
          const bStarts = bSymbol.startsWith(queryUpper);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;

          // If both start with query, shorter symbol comes first
          if (aStarts && bStarts) {
            return aSymbol.length - bSymbol.length;
          }

          // Otherwise maintain original order
          return 0;
        });

        setResults(sortedData);
        setOpen(true);
        setSearchDone(true);
        setHighlighted(sortedData.length > 0 ? 0 : -1);
      })
      .catch((error) => {
        // Silently handle fetch errors (e.g., aborted requests when typing quickly)
        console.log("Search request failed:", error.message);
      })
      .finally(() => setSearching(false));
  }, []);

  // Auto-search when initialQuery is provided
  const lastInitialQuery = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Only trigger if initialQuery changed and is valid
    if (
      initialQuery &&
      initialQuery.length >= 2 &&
      initialQuery !== lastInitialQuery.current
    ) {
      lastInitialQuery.current = initialQuery;
      // Focus the input and trigger search
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        search(initialQuery);
      }, 50); // Small delay to ensure component is mounted
      return () => clearTimeout(timer);
    }
  }, [initialQuery, search]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 200);
  };

  const handleSelect = (doc: SearchResult) => {
    onSelect(doc.symbol);
    setQuery("");
    setResults([]);
    setOpen(false);
    setHighlighted(-1);
    setSearchDone(false);
  };

  const handleOpenManualForm = () => {
    setShowManualForm(true);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Escape") {
        setQuery("");
        onCancel?.();
      }
      return;
    }
    const totalItems = results.length + (searchDone ? 1 : 0);
    if (totalItems === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted((i) => (i + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted((i) => (i - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (highlighted >= 0 && highlighted < results.length) {
          handleSelect(results[highlighted]);
        } else if (
          highlighted === results.length ||
          (results.length === 0 && highlighted === 0)
        ) {
          handleOpenManualForm();
        }
        break;
      case "Escape":
        setOpen(false);
        setHighlighted(-1);
        onCancel?.();
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              setFocused(true);
              // Open dropdown if search is done, or trigger search if we have a query
              if (searchDone) {
                setOpen(true);
              } else if (query.length >= 2 && !searching) {
                search(query);
              }
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Search by symbol or title..."}
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
            autoFocus={compact}
          />
          {searching && (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          )}
          {onCancel && (
            <button
              onClick={onCancel}
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
          onClick={handleOpenManualForm}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition-colors hover:border-un-blue/40 hover:bg-gray-50 hover:text-un-blue"
          title="Add document manually"
        >
          <FileText className="h-3.5 w-3.5" />
          Add manually
        </button>
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((doc, i) => (
            <button
              key={doc.symbol}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(doc)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full border-b border-gray-100 px-3 py-2 text-left ${
                i === highlighted ? "bg-un-blue/10" : "hover:bg-gray-50"
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
          {searchDone && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleOpenManualForm}
              onMouseEnter={() => setHighlighted(results.length)}
              className={`w-full border-t border-gray-100 px-3 py-2 text-left text-sm ${
                highlighted === results.length
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
      )}
    </div>
  );
}
