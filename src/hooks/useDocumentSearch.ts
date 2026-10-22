"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  searchDocumentsAction,
  type DocumentSearchResult,
} from "@/features/mandates/services/documents/document-fetching";

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

/** Each input owns its debounce and request lifetime. Server actions cannot be
 * aborted, so ignore responses after a query/focus change or unmount. */
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
    const timer = setTimeout(() => {
      setState({ request, results: [], status: "loading" });
      searchDocumentsAction(term).then(
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
