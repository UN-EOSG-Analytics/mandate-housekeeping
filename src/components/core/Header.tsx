import { getBudgetVersion } from "@/lib/db/review-cycle";
import {
  CURRENT_BUDGET_VERSION,
  SUBMISSION_CYCLES,
  type BudgetVersion,
} from "@/lib/db/budget-version";
import Link from "next/link";
import { SiteHeader } from "@un-eosg/ui/components/site-header";
import { cn } from "@/lib/utils";
import { typography } from "@un-eosg/ui/typography";
import { UserMenu } from "./UserMenu";
import type { EntityOption } from "@/features/mandates/services/data-service";

interface Props {
  user?: { email: string; entity?: string | null; isReviewer?: boolean } | null;
  children?: React.ReactNode;
  entities?: EntityOption[];
  maxWidth?: "6xl" | "7xl";
  hideAbout?: boolean;
  navigationPending?: boolean;
  budgetVersion?: BudgetVersion;
}

export const SITE_TITLE = "Mandate Housekeeping Platform";
export const SITE_SUBTITLE = "Mandate submissions";

export async function Header({
  user,
  children,
  entities = [],
  maxWidth = "7xl",
  hideAbout = false,
  navigationPending = false,
  budgetVersion,
}: Props) {
  const version =
    budgetVersion ?? (user ? await getBudgetVersion() : CURRENT_BUDGET_VERSION);
  const isLoggedIn = !!user;
  const widthClass = maxWidth === "6xl" ? "max-w-6xl" : "max-w-7xl";

  return (
    <SiteHeader
      brand="Mandate"
      descriptor="Housekeeping Platform"
      href={isLoggedIn || navigationPending ? "/" : "/about"}
      homeLabel={SITE_TITLE}
      badge={
        <span className="flex items-center gap-2">
          <span
            className={`${typography.micro} rounded border border-border bg-secondary px-1.5 py-0.5 text-foreground`}
          >
            Beta
          </span>
          <span className={cn(typography.caption, "text-foreground")}>
            {user || navigationPending
              ? SUBMISSION_CYCLES[version].label
              : SITE_SUBTITLE}
          </span>
        </span>
      }
      showMobileMenu={false}
      transparency="none"
      className="relative top-auto py-4"
      containerClassName={`${widthClass} flex-wrap px-3 sm:px-4`}
    >
      <div className="flex flex-wrap items-center justify-end gap-4">
        {!hideAbout && (
          <>
            {user?.isReviewer && (
              <Link
                href="/analysis"
                className="text-sm font-medium text-foreground transition-colors hover:text-un-blue-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
              >
                Analysis
              </Link>
            )}
            <Link
              href="/about"
              className="text-sm font-medium text-foreground transition-colors hover:text-un-blue-text focus-visible:rounded focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
            >
              About
            </Link>
            <div className="h-6 w-px bg-gray-200" />
          </>
        )}
        {navigationPending ? (
          <span
            aria-busy="true"
            className="h-8 w-24 animate-pulse rounded bg-gray-100 motion-reduce:animate-none"
          >
            <span className="sr-only">Loading account navigation</span>
          </span>
        ) : isLoggedIn ? (
          <UserMenu
            email={user.email}
            entity={user.entity}
            isReviewer={user.isReviewer}
            entities={entities}
          />
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-un-blue-text px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue-shade focus-visible:ring-2 focus-visible:ring-un-blue focus-visible:ring-offset-2"
          >
            Sign In
          </Link>
        )}
        {children}
      </div>
    </SiteHeader>
  );
}
