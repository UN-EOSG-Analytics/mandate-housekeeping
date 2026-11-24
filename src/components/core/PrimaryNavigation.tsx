"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MY_SUBMISSION_PATH } from "@/features/auth/navigation";
import { cn } from "@/lib/utils";

export function PrimaryNavigation({
  entity,
  isReviewer,
}: {
  entity?: string | null;
  isReviewer: boolean;
}) {
  const pathname = usePathname().replace(/\/+$/, "") || "/";
  let pathEntity: string | null = null;
  if (pathname.startsWith("/entity/")) {
    try {
      pathEntity = decodeURIComponent(pathname.slice("/entity/".length));
    } catch {
      // An invalid encoded route must not select another entity's submission.
    }
  }
  const ownSubmission =
    !isReviewer &&
    (pathname === MY_SUBMISSION_PATH || (!!entity && pathEntity === entity));
  const items = [
    {
      href: "/",
      label: "Overview",
      active:
        pathname === "/" || (pathname.startsWith("/entity/") && !ownSubmission),
    },
    isReviewer
      ? {
          href: "/analysis",
          label: "Analysis",
          active: pathname.startsWith("/analysis"),
        }
      : {
          href: MY_SUBMISSION_PATH,
          label: "My submission",
          active: ownSubmission,
        },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="flex flex-wrap items-center gap-4"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded text-sm font-medium transition-colors hover:text-un-blue-text-aaa focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2",
            item.active
              ? "text-un-blue-text-aaa underline decoration-2 underline-offset-8"
              : "text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
