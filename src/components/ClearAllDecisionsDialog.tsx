"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  entityName: string;
  onClearingStateChange?: (isClearing: boolean) => void;
}

export function ClearAllDecisionsDialog({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  onClearingStateChange,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmEnabled =
    confirmText.trim().toUpperCase() === entityName.toUpperCase();

  const handleClose = useCallback(() => {
    setConfirmText("");
    setError(null);
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    if (!isConfirmEnabled) return;

    setIsClearing(true);
    setError(null);
    onClearingStateChange?.(true);

    try {
      await onConfirm();
      setConfirmText("");
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data");
    } finally {
      setIsClearing(false);
      onClearingStateChange?.(false);
    }
  }, [isConfirmEnabled, onConfirm, handleClose, onClearingStateChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && isConfirmEnabled && !isClearing) {
        handleConfirm();
      }
    },
    [isConfirmEnabled, isClearing, handleConfirm],
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isClearing) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!isClearing}>
        <DialogHeader className="text-left">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <DialogTitle>Clear All Decisions</DialogTitle>
          <DialogDescription>
            This action will permanently delete all decisions and comments for{" "}
            <strong className="text-foreground">{entityName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action cannot be undone. All
              decision history, including approvals and comments, will be
              permanently deleted for this entity.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirm-entity-name"
              className="block text-sm font-medium text-gray-700"
            >
              To confirm, type{" "}
              <span className="font-mono font-bold text-red-600">
                {entityName}
              </span>{" "}
              below:
            </label>
            <input
              id="confirm-entity-name"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={entityName}
              disabled={isClearing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-600"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <button
            onClick={handleClose}
            disabled={isClearing}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:bg-gray-200 disabled:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmEnabled || isClearing}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
          >
            {isClearing ? "Clearing..." : "Clear All Decisions"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
