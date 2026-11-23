"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EntityOption } from "@/features/mandates/services/data-service";

interface EntityComboboxProps {
  value: string;
  onChange: (value: string) => void;
  entities: EntityOption[];
  placeholder?: string;
  className?: string;
}

export function EntityCombobox({
  value,
  onChange,
  entities,
  placeholder = "Select entity...",
  className,
}: EntityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const allEntities = React.useMemo(() => {
    // Regular entities from database (with citations)
    const entityItems = entities.map((e) => ({
      value: e.entity,
      label: e.entity,
      longName: e.entity_long,
      searchTerms: `${e.entity.toLowerCase()} ${e.entity_long?.toLowerCase() || ""}`,
    }));

    // Special non-entity options
    const specialOptions = [
      {
        value: "Other – Please Specify",
        label: "Other – Please Specify",
        searchTerms: "other please specify",
      },
    ];

    return [...entityItems, ...specialOptions];
  }, [entities]);

  const displayValue = React.useMemo(() => {
    if (!value) return placeholder;
    const found = allEntities.find((entity) => entity.value === value);
    return found?.label || value;
  }, [value, allEntities, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto w-full justify-between rounded-lg border-gray-300 px-4 py-2.5 text-sm font-normal transition-all hover:bg-transparent",
            !value && "text-gray-700",
            open && "border-un-blue ring-2 ring-un-blue/20",
            className,
          )}
        >
          {displayValue}
          <ChevronsUpDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 transition-colors",
              open ? "text-un-blue" : "opacity-50",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) border-un-blue/20 p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search entity..."
            className="h-9 border-b border-un-blue/10 text-foreground placeholder:text-gray-600 focus:ring-0"
            value={open ? undefined : displayValue}
            onValueChange={() => listRef.current?.scrollTo(0, 0)}
          />
          <CommandList ref={listRef}>
            <CommandEmpty className="py-6 text-sm text-gray-700">
              No entity found.
            </CommandEmpty>
            <CommandGroup>
              {allEntities.map((entity) => (
                <CommandItem
                  key={entity.value}
                  value={entity.searchTerms}
                  onSelect={() => {
                    onChange(entity.value);
                    setOpen(false);
                  }}
                  className="aria-selected:bg-un-blue/5 aria-selected:text-un-blue-text-aaa"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{entity.label}</span>
                    {"longName" in entity && entity.longName ? (
                      <span className="truncate text-xs text-gray-700">
                        {String(entity.longName)}
                      </span>
                    ) : null}
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4 shrink-0 text-un-blue",
                      value === entity.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
