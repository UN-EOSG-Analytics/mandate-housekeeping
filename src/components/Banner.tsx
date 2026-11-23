"use client";

import { AlertCircle, Check, Info, Lock, X } from "lucide-react";
import { ReactNode } from "react";
import Link from "next/link";

type BannerVariant =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "review"
  | "reviewer-mode";

interface BannerProps {
  variant: BannerVariant;
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  icon?: boolean;
  className?: string;
}

const variantStyles: Record<
  BannerVariant,
  {
    container: string;
    text: string;
    icon: typeof Info;
    iconColor: string;
    dismissButton?: string;
  }
> = {
  info: {
    container: "border-l-4 border-un-blue bg-gray-50 px-6 py-3",
    text: "text-gray-600",
    icon: Info,
    iconColor: "text-un-blue-text",
  },
  success: {
    container:
      "rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2",
    text: "text-green-700",
    icon: Check,
    iconColor: "text-green-600",
  },
  warning: {
    container: "border-l-4 border-amber-500 bg-amber-50 px-6 py-3",
    text: "text-amber-800",
    icon: AlertCircle,
    iconColor: "text-amber-600",
  },
  error: {
    container: "border-l-4 border-red-500 bg-red-50 px-6 py-3",
    text: "text-red-800",
    icon: AlertCircle,
    iconColor: "text-red-600",
  },
  review: {
    container: "border-l-4 border-amber-500 bg-amber-50 px-6 py-3",
    text: "text-amber-800",
    icon: Lock,
    iconColor: "text-amber-600",
    dismissButton:
      "rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200",
  },
  "reviewer-mode": {
    container: "border-l-4 border-amber-500 bg-amber-50 px-6 py-3",
    text: "text-gray-700",
    icon: AlertCircle,
    iconColor: "text-amber-700",
  },
};

export function Banner({
  variant,
  children,
  onDismiss,
  dismissLabel,
  icon = true,
  className = "",
}: BannerProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div className={`${styles.container} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <Icon className={`h-5 w-5 ${styles.iconColor}`} />}
          <div className={`text-sm ${styles.text}`}>{children}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label={dismissLabel || "Dismiss notice"}
            className={`flex items-center gap-1.5 ${styles.dismissButton || "text-gray-600 hover:text-gray-700"}`}
          >
            {dismissLabel && (
              <span className="text-xs font-medium">{dismissLabel}</span>
            )}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Specific banner components for common use cases
 */

interface ReadOnlyNoticeBannerProps {
  viewingEntity: string;
  userEntity: string;
}

export function ReadOnlyNoticeBanner({
  viewingEntity,
  userEntity,
}: ReadOnlyNoticeBannerProps) {
  return (
    <Banner variant="info" icon={false}>
      You are viewing{" "}
      <Link
        href={`/entity/${encodeURIComponent(viewingEntity)}`}
        className="rounded font-medium text-un-blue-text underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-un-blue"
      >
        {viewingEntity}
      </Link>{" "}
      but your entity is{" "}
      <Link
        href={`/entity/${encodeURIComponent(userEntity)}`}
        className="rounded font-medium text-un-blue-text underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-un-blue"
      >
        {userEntity}
      </Link>
      . This workspace is read-only for you. Open your own entity to edit its
      primary submission.
    </Banner>
  );
}

interface ReviewerModeBannerProps {
  reviewingEntity: string;
}

export function ReviewerModeBanner({
  reviewingEntity,
}: ReviewerModeBannerProps) {
  return (
    <Banner variant="reviewer-mode" icon={false}>
      <span className="font-medium text-amber-700">Reviewer Mode:</span> You are
      reviewing{" "}
      <span className="font-medium text-un-blue-text">{reviewingEntity}</span>.
      Record your review in the review track. The entity submission remains
      visible alongside it.
    </Banner>
  );
}

interface ReviewInProgressBannerProps {
  startedBy: string | null;
  isReviewer: boolean;
  onEndReview?: () => void;
}

export function ReviewInProgressBanner({
  startedBy,
  isReviewer,
  onEndReview,
}: ReviewInProgressBannerProps) {
  return (
    <Banner
      variant="review"
      onDismiss={isReviewer && onEndReview ? onEndReview : undefined}
      dismissLabel={
        isReviewer && onEndReview
          ? "End review and unlock submission"
          : undefined
      }
    >
      <div>
        <p className="font-medium">This submission is currently under review</p>
        <p className="text-xs text-amber-800">
          Primary submission edits are paused while review is in progress. You
          can still inspect the citations and discussion.
          {isReviewer && startedBy && (
            <span className="ml-1">
              Review started by <span className="font-medium">{startedBy}</span>
            </span>
          )}
        </p>
      </div>
    </Banner>
  );
}

interface SuccessBannerProps {
  message: string;
}

export function SuccessBanner({ message }: SuccessBannerProps) {
  return (
    <Banner variant="success">
      <span className="font-medium">{message}</span>
    </Banner>
  );
}

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <Banner variant="error" onDismiss={onDismiss}>
      <span className="font-medium">{message}</span>
    </Banner>
  );
}
