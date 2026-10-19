"use client";

import { CURRENT_BUDGET_VERSION } from "@/lib/db/budget-version";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { STATUS_THEME } from "@/lib/theme";
import { Check, Clock, FileText, Loader2, Upload, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  entity: string;
  subprogramme?: string | null;
}

interface ExistingUpload {
  id: string;
  filename: string;
  size: number;
  userEmail: string;
  createdAt: string;
}

type UploadState = "loading" | "idle" | "uploading" | "success" | "error";

export function DocxUploadButton({ entity, subprogramme }: Props) {
  const [state, setState] = useState<UploadState>("loading");
  const [existingUpload, setExistingUpload] = useState<ExistingUpload | null>(
    null,
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for existing upload on mount
  useEffect(() => {
    const checkExistingUpload = async () => {
      try {
        const response = await fetch(
          `/api/upload/docx?entity=${encodeURIComponent(entity)}`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.uploads && data.uploads.length > 0) {
            setExistingUpload(data.uploads[0]);
          }
        }
      } catch (err) {
        console.error("Failed to check existing uploads:", err);
      } finally {
        setState("idle");
      }
    };

    checkExistingUpload();
  }, [entity]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPopoverOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setPopoverOpen(false), 150);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    const allowedType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (file.type !== allowedType && !file.name.endsWith(".docx")) {
      alert("Only DOCX files are allowed");
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert("File size exceeds 50MB limit");
      return;
    }

    setState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("budgetVersion", CURRENT_BUDGET_VERSION);
      formData.append("entity", entity);
      if (subprogramme) {
        formData.append("subprogramme", subprogramme);
      }

      const response = await fetch("/api/upload/docx", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setState("success");
      // Set existing upload from response
      setExistingUpload({
        id: data.upload.id,
        filename: data.upload.filename,
        size: data.upload.size,
        userEmail: data.upload.userEmail || "You",
        createdAt: data.upload.createdAt,
      });
    } catch (err) {
      setState("error");
      alert(err instanceof Error ? err.message : "Upload failed");
      setTimeout(() => setState("idle"), 1000);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // If already uploaded, show uploaded state with hover tooltip
  if (existingUpload) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`inline-flex cursor-default items-center gap-1.5 rounded-md ${STATUS_THEME.success.border} ${STATUS_THEME.success.bg} px-2.5 py-1.5 text-xs font-medium ${STATUS_THEME.success.text}`}
          >
            <Check className="h-3.5 w-3.5" />
            DOCX Submission Uploaded
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 overflow-hidden p-0"
          side="bottom"
          sideOffset={8}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
            <h4 className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              Upload Details
            </h4>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-3 py-2.5">
              <div className="flex gap-2.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${STATUS_THEME.success.icon}`}
                >
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-700">
                    {existingUpload.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(existingUpload.size)}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-un-blue/10 text-un-blue">
                  <User className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    {existingUpload.userEmail}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700">
                    {formatDate(existingUpload.createdAt)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-700">
                <span className="font-medium">Note:</span> Automatic processing
                is currently deactivated for now.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={state === "uploading" || state === "loading"}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all ${
          state === "success"
            ? `${STATUS_THEME.success.border} ${STATUS_THEME.success.bg} ${STATUS_THEME.success.text}`
            : state === "uploading" || state === "loading"
              ? "border-gray-200 bg-gray-50 text-gray-500"
              : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
        }`}
      >
        {state === "uploading" || state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "success" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {state === "success"
          ? "Uploaded"
          : state === "loading"
            ? "Loading..."
            : "Upload DOCX Submission"}
      </button>
    </>
  );
}
