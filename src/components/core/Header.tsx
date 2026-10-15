import { getBudgetVersion } from "@/lib/db/review-cycle";
import { selectReviewCycle } from "@/features/mandates/actions/review-cycle";
import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "./UserMenu";
import type { EntityOption } from "@/features/mandates/services/data-service";

interface Props {
  user?: { email: string; entity?: string | null; isReviewer?: boolean } | null;
  children?: React.ReactNode;
  entities?: EntityOption[];
  maxWidth?: "6xl" | "7xl";
  hideAbout?: boolean;
}

export const SITE_TITLE = "Mandate Housekeeping Platform";
export const SITE_SUBTITLE = "PPB 2027 Mandate Submissions";

export async function Header({
  user,
  children,
  entities = [],
  maxWidth = "7xl",
  hideAbout = false,
}: Props) {
  const version = user ? await getBudgetVersion() : "ppb2026";
  const isLoggedIn = !!user;
  const widthClass = maxWidth === "6xl" ? "max-w-6xl" : "max-w-7xl";

  return (
    <header className="border-b border-gray-200 bg-white">
      <div
        className={`mx-auto flex ${widthClass} items-center justify-between px-3 py-4 sm:px-4`}
      >
        <Link
          href={isLoggedIn ? "/" : "/about"}
          className="flex items-center gap-3 hover:opacity-90"
        >
          <Image
            src="/images/UN_Logo_Stacked_Colour_English.svg"
            alt="UN Logo"
            width={50}
            height={50}
            priority
            className="h-12 w-auto select-none"
            draggable={false}
          />
          <div>
            <div className="flex items-start gap-1.5">
              <h1 className="text-xl font-bold text-gray-900">{SITE_TITLE}</h1>
              <span className="mt-0.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-500">
                Beta
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {user && version === "ppb2027"
                ? "PPB 2027 citations · read-only"
                : SITE_SUBTITLE}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          {!hideAbout && (
            <>
              {user?.isReviewer && (
                <Link
                  href="/analysis"
                  className="text-sm font-medium text-gray-700 transition-colors hover:text-un-blue"
                >
                  Analysis
                </Link>
              )}
              <Link
                href="/about"
                className="text-sm font-medium text-gray-700 transition-colors hover:text-un-blue"
              >
                About
              </Link>
              <div className="h-6 w-px bg-gray-200" />
            </>
          )}
          {isLoggedIn ? (
            <UserMenu
              email={user.email}
              entity={user.entity}
              isReviewer={user.isReviewer}
              entities={entities}
            />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-un-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue/90"
            >
              Sign In
            </Link>
          )}
          {user && (
            <form
              action={selectReviewCycle}
              className="flex items-center gap-2 text-sm"
            >
              <label htmlFor="review-cycle">Budget cycle</label>
              <select
                key={version}
                id="review-cycle"
                name="version"
                defaultValue={version}
                className="rounded border p-1"
              >
                <option value="ppb2026">PPB 2026 review</option>
                <option value="ppb2027">PPB 2027 · read-only</option>
              </select>
              <button type="submit" className="text-un-blue">
                View
              </button>
            </form>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
