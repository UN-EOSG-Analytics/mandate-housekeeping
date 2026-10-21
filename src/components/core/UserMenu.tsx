"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { AccountMenu } from "@un-eosg/ui/components/account-menu";
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
  return (
    <>
      <AccountMenu
        email={email}
        entity={entity ? { label: "Entity", value: entity } : undefined}
        role={isReviewer ? { label: "Role", value: "Reviewer" } : undefined}
        labels={{
          accountMenu: "Account menu",
          signedInAs: "Signed in as",
          signOut: "Sign out",
          signingOut: "Signing out…",
          signOutError: "Could not sign out. Please try again.",
        }}
        actions={[
          {
            id: "change-entity",
            label: "Change entity",
            icon: <Building2 />,
            onSelect: () => setIsDialogOpen(true),
          },
        ]}
        onSignOut={logoutAction}
      />
      <EntityChangeDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        currentEntity={entity || null}
        entities={entities}
      />
    </>
  );
}
