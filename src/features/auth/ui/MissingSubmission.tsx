"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@un-eosg/ui/components/button";
import { typography } from "@un-eosg/ui/typography";
import type { EntityOption } from "@/features/mandates/services/data-service";
import { EntityChangeDialog } from "./EntityChangeDialog";

export function MissingSubmission({
  entity,
  entities,
}: {
  entity: string | null;
  entities: EntityOption[];
}) {
  const [selectingEntity, setSelectingEntity] = useState(false);
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className={typography.sectionTitle}>My submission</h1>
      <p className={`${typography.body} text-foreground`}>
        {entity
          ? `No citation workspace is available for ${entity} in the selected cycle. Change your entity if it is incorrect, or choose a different submission cycle.`
          : "Choose your organisational entity to open its submission workspace. You can also browse all entities in Overview."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelectingEntity(true)}
        >
          {entity ? "Change entity" : "Choose entity"}
        </Button>
        <Link
          href="/"
          className="rounded text-sm font-medium text-un-blue-text-aaa underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-un-blue"
        >
          Open Overview
        </Link>
      </div>
      <EntityChangeDialog
        isOpen={selectingEntity}
        onClose={() => setSelectingEntity(false)}
        currentEntity={entity}
        entities={entities}
      />
    </section>
  );
}
