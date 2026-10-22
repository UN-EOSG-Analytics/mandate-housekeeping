"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSearchResult } from "@/features/mandates/services/documents/document-fetching";
import { searchDocumentsAction } from "@/features/mandates/services/client-reads";

interface SearchRequest {
  term: string;
  active: boolean;
  attempt: number;
}

interface SearchState {
  request: SearchRequest;
  results: DocumentSearchResult[];
  status: "loading" | "done" | "error";
}

/** Debounce and abort obsolete HTTP searches. Generation and request identity
 * also reject late responses immediately after an edit, selection or retry. */
export function useDocumentSearch(query: string, active: boolean) {
  const term = query.trim();
  const [state, setState] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const request = useMemo(
    () => ({ term, active, attempt }),
    [term, active, attempt],
  );
  const invalidate = useCallback(() => {
    generation.current += 1;
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active || term.length < 2) return;
    let cancelled = false;
    const currentGeneration = generation.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ request, results: [], status: "loading" });
      searchDocumentsAction(term, controller.signal).then(
        (results) => {
          if (!cancelled && generation.current === currentGeneration)
            setState({ request, results, status: "done" });
        },
        () => {
          if (!cancelled && generation.current === currentGeneration)
            setState({ request, results: [], status: "error" });
        },
      );
    }, 200);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, active, request]);

  const enabled = active && term.length >= 2;
  const current = enabled && state?.request === request ? state : null;
  return {
    results: current?.results ?? [],
    searching: enabled && (!current || current.status === "loading"),
    searchDone: current?.status === "done",
    searchError: current?.status === "error",
    retry: invalidate,
    invalidate,
  };
}
