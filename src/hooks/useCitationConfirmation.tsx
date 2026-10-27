"use client";

import { useEffect, useRef, useState } from "react";
import type { EntityCitationIndex } from "@/features/mandates/services/citation-locations";
import {
  getPendingCitationWarning,
  type MandateWarning,
} from "@/features/mandates/services/mandate-warnings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** No optimistic state or database write should precede this confirmation. */
export function useCitationConfirmation(citations: EntityCitationIndex) {
  const [pending, setPending] = useState<{
    symbol: string;
    warning: MandateWarning;
  } | null>(null);
  const resolve = useRef<((proceed: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );

  const finish = (proceed: boolean) => {
    resolve.current?.(proceed);
    resolve.current = null;
    setPending(null);
  };
  const confirmCitation = (
    symbol: string,
    subprogramme: string | null,
    sourceSymbol?: string,
  ): Promise<boolean> => {
    const warning = getPendingCitationWarning(
      symbol,
      subprogramme,
      citations,
      sourceSymbol,
    );
    if (!warning) return Promise.resolve(true);
    // Only one proposed mutation can await confirmation at a time.
    resolve.current?.(false);
    return new Promise((done) => {
      resolve.current = done;
      setPending({ symbol, warning });
    });
  };
  const citationConfirmation = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolution already cited</DialogTitle>
          <DialogDescription>
            {pending?.symbol} is already included in this entity. Do you want to
            proceed?
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {pending?.warning.locations?.map((location, index) => (
            <li key={`${location.label}:${index}`}>
              <div className="font-medium">{location.label}</div>
              <div>{location.detail}</div>
            </li>
          ))}
        </ul>
        {pending?.warning.advice && (
          <p className="text-sm">{pending.warning.advice}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" autoFocus onClick={() => finish(false)}>
            Cancel
          </Button>
          <Button onClick={() => finish(true)}>Proceed</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
  return { confirmCitation, citationConfirmation };
}
