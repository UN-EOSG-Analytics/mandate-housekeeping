"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EntityCombobox } from "./EntityCombobox";
import type { EntityOption } from "@/features/mandates/services/data-service";
import { updateEntityAction } from "@/features/auth/actions";

interface EntityChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentEntity: string | null;
  entities: EntityOption[];
}

export function EntityChangeDialog({
  isOpen,
  onClose,
  currentEntity,
  entities,
}: EntityChangeDialogProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [otherEntity, setOtherEntity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedEntity(currentEntity || "");
      setOtherEntity("");
      setError(null);
    }
  }, [isOpen, currentEntity]);

  const handleSubmit = async () => {
    const entity =
      selectedEntity === "Other – Please Specify"
        ? otherEntity.trim()
        : selectedEntity;

    if (!entity) {
      setError("Please select an entity");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await updateEntityAction(entity);

      if (result.success) {
        // Full page reload to ensure all server components reflect the new entity
        // (e.g., reviewer status, entity-specific data)
        window.location.reload();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to update entity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          openerRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
        className="gap-0 sm:max-w-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-semibold text-gray-900">
            Update Entity
          </DialogTitle>
          <button
            onClick={onClose}
            aria-label="Close entity selection"
            className="rounded-lg p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Choose the entity whose budget submission you work on. You can edit
            its primary submission and browse other entities. Reviewer access is
            assigned separately.
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select your organisational entity
            </label>
            <EntityCombobox
              value={selectedEntity}
              onChange={setSelectedEntity}
              entities={entities}
              placeholder="Choose entity..."
            />
          </div>

          {selectedEntity === "Other – Please Specify" && (
            <input
              type="text"
              placeholder="Enter your organisational entity"
              value={otherEntity}
              onChange={(e) => setOtherEntity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-gray-600 focus:border-un-blue focus:ring-1 focus:ring-un-blue focus:outline-none"
            />
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                loading ||
                !selectedEntity ||
                (selectedEntity === "Other – Please Specify" &&
                  !otherEntity.trim())
              }
              className="flex-1 rounded-lg bg-un-blue-text-aaa px-4 py-2.5 text-sm font-medium text-white transition-colors hover:inset-ring-2 hover:inset-ring-white/70 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700 disabled:opacity-100"
            >
              {loading ? "Updating..." : "Update"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
