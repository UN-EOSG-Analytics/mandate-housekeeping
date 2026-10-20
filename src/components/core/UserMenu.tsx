"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { EntityChangeDialog } from "../../features/auth/ui/EntityChangeDialog";
import type { EntityOption } from "@/features/mandates/services/data-service";
import { logoutAction } from "@/features/auth/actions";

export function UserMenu({
  email,
  entity,
  isReviewer,
  entities,
}: {
  email: string;
  entity?: string | null;
  isReviewer?: boolean;
  entities: EntityOption[];
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  async function handleLogout() {
    await logoutAction();
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{email}</span>
          {entity && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="rounded-full bg-un-blue-surface px-2 py-0.5 text-xs font-medium text-un-blue-text transition-colors hover:bg-un-blue-tint-50 focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
              title="Click to update entity"
            >
              {entity}
            </button>
          )}
          {isReviewer && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
              Reviewer
            </span>
          )}
        </div>
        <div className="h-6 w-px bg-gray-200" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-foreground transition-colors hover:text-un-blue-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
        >
          Logout
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <EntityChangeDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        currentEntity={entity || null}
        entities={entities}
      />
    </>
  );
}
