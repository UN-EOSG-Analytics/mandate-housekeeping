"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { EntityCombobox } from "@/features/auth/ui/EntityCombobox";
import type { EntityOption } from "@/features/mandates/services/data-service";
import {
  checkEntityForTokenAction,
  verifyMagicTokenAction,
} from "@/features/auth/actions";

interface VerifyFormProps {
  entities: EntityOption[];
}

export function VerifyForm({ entities }: VerifyFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [otherEntity, setOtherEntity] = useState("");
  const [hasExistingEntity, setHasExistingEntity] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Check if user already has entity set
  useEffect(() => {
    if (!token) {
      queueMicrotask(() => setChecking(false));
      return;
    }

    checkEntityForTokenAction(token)
      .then((result) => {
        if (!result.success) {
          setError(result.error);
        } else if (result.data) {
          setUserEmail(result.data.email);
          setHasExistingEntity(result.data.hasEntity);
          if (result.data.entity) {
            setSelectedEntity(result.data.entity);
          }
        }
        setChecking(false);
      })
      .catch(() => {
        setError("Failed to verify token");
        setChecking(false);
      });
  }, [token]);

  const handleVerify = async () => {
    if (!token) return;

    const entity = hasExistingEntity
      ? undefined
      : selectedEntity === "Other – Please Specify"
        ? otherEntity.trim()
        : selectedEntity;

    if (!hasExistingEntity && !entity) {
      setError("Please select your organisational entity");
      return;
    }

    setLoading(true);

    const result = await verifyMagicTokenAction(token, entity);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/");
  };

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">
                Missing verification token.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-gray-500">Verifying...</p>
          </div>
        </div>
      </div>
    );
  }

  // User already has entity - simple sign in
  if (hasExistingEntity) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-1 text-2xl font-bold text-gray-900">
              Complete Sign In
            </h1>
            <p className="mb-8 text-sm text-gray-500">
              Signing in as <span className="font-medium">{userEmail}</span>
            </p>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full rounded-lg bg-un-blue px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-un-blue/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Complete sign-in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // New user or no entity - show entity selection
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            Complete Sign In
          </h1>
          {userEmail && (
            <p className="mb-6 text-sm text-gray-500">
              Signing in as <span className="font-medium">{userEmail}</span>
            </p>
          )}
          <p className="mb-6 text-sm text-gray-500">
            Please select your organisational entity to continue.
          </p>

          <div className="space-y-5">
            <EntityCombobox
              value={selectedEntity}
              onChange={setSelectedEntity}
              entities={entities}
              placeholder="Choose entity..."
            />

            {selectedEntity === "Other – Please Specify" && (
              <input
                type="text"
                placeholder="Enter your organisational entity"
                value={otherEntity}
                onChange={(e) => setOtherEntity(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-all placeholder:text-gray-400 focus:border-un-blue focus:ring-2 focus:ring-un-blue/20 focus:outline-none"
              />
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={
                loading ||
                !selectedEntity ||
                (selectedEntity === "Other – Please Specify" &&
                  !otherEntity.trim())
              }
              className="w-full rounded-lg bg-un-blue px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-un-blue/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Complete sign-in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
