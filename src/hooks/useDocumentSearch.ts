"use client";

import { useEffect, useState } from "react";
import {
  searchDocumentsAction,
  type DocumentSearchResult,
} from "@/features/mandates/services/documents/document-fetching";

interface SearchState {
  query: string;
  results: DocumentSearchResult[];
  status: "loading" | "done" | "error";
}

/** Each input owns its debounce and request lifetime. Server actions cannot be
 * aborted, so ignore responses after a query/focus change or unmount. */
export function useDocumentSearch(query: string, active: boolean) {
  const term = query.trim();
  const [state, setState] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setState({ query: term, results: [], status: "loading" });
      searchDocumentsAction(term).then(
        (results) => {
          if (!cancelled) setState({ query: term, results, status: "done" });
        },
        () => {
          if (!cancelled)
            setState({ query: term, results: [], status: "error" });
        },
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, active, attempt]);

  const enabled = active && term.length >= 2;
  const current = enabled && state?.query === term ? state : null;
  return {
    results: current?.results ?? [],
    searching: enabled && (!current || current.status === "loading"),
    searchDone: current?.status === "done",
    searchError: current?.status === "error",
    retry: () => setAttempt((value) => value + 1),
  };
}
