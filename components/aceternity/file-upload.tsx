"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Upload, X } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/api";
import type { UploadedFile } from "@/lib/types";

/**
 * Animated dropzone — Aceternity UI's File Upload pattern (copy-paste source,
 * adapted rather than installed), restyled onto the Figma dropzone spec:
 * white fill, 1.5px #CECECE dashed 6-6 stroke, 20px radius.
 *
 * Empty and filled states are the two Figma upload frames; the motion layer
 * (lift on hover, dashed-border pulse while dragging, spring-in on drop) is
 * the Aceternity flourish.
 */

interface FileUploadProps {
  /** Plain first word of the label, e.g. "Upload". */
  labelPrefix: string;
  /** Orange-highlighted portion, e.g. "Question Paper". */
  labelHighlight: string;
  file?: UploadedFile;
  onSelect: (file: File) => void;
  onRemove: () => void;
  error?: string | null;
  accept?: string;
}

export function FileUpload({
  labelPrefix,
  labelHighlight,
  file,
  onSelect,
  onRemove,
  error,
  accept = ".pdf,image/*",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onSelect(dropped);
  }

  return (
    <motion.div
      whileHover={{ scale: file ? 1 : 1.01 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative flex min-h-[132px] flex-1 items-center justify-center rounded-[20px] bg-white p-4 lg:p-2.5",
        // The dashed outline is an SVG stroke, not a CSS border - see
        // .veda-dashed in globals.css for why.
        isDragging
          ? "veda-dashed-active bg-[rgba(255,86,35,0.04)]"
          : error
            ? "veda-dashed-error"
            : "veda-dashed",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onSelect(picked);
          // Let the same file be re-picked after a remove.
          e.target.value = "";
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {file ? (
          <motion.div
            key="filled"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative flex w-full items-center justify-center"
          >
            {/* File chip — EL-6cb6a5e0 */}
            <div className="flex max-w-full items-center gap-3 rounded-xl bg-[var(--veda-offwhite-primary)] py-3 pl-3 pr-5">
              <Image
                src="/figma/file-thumb.png"
                alt=""
                width={35}
                height={40}
                className="h-10 w-[35px] shrink-0 rounded-[3px] object-cover"
              />
              <div className="flex min-w-0 flex-col items-center">
                <p className="veda-p3-bold w-full truncate text-center text-[var(--veda-dark-grey)]">
                  {file.name}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <span className="veda-p4 text-[var(--veda-text-secondary)]">
                    {formatFileSize(file.size)}
                  </span>
                  <span className="size-[5px] rounded-full bg-[var(--veda-text-secondary)]" />
                  <span className="veda-p4 text-[var(--veda-text-secondary)]">
                    {file.pageCount} {file.pageCount === 1 ? "Page" : "Pages"}
                  </span>
                </div>
              </div>
            </div>

            {/* Remove — 25.6px circle, Dark-Grey 80, effect_80f1db0f */}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${file.name}`}
              className="absolute -right-1 -top-2 grid size-[25.6px] place-items-center rounded-full bg-[var(--veda-dark-grey-80)] shadow-[0px_4px_11.4px_0px_rgba(0,0,0,0.25)] transition-transform hover:scale-105"
            >
              <X className="size-4 text-white" strokeWidth={2.5} />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={() => inputRef.current?.click()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full flex-col items-center gap-3 lg:gap-4"
          >
            <motion.span
              animate={isDragging ? { y: -4 } : { y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="grid size-10 shrink-0 place-items-center rounded-[7px] bg-[var(--veda-dropzone-icon-bg)] lg:size-12 lg:rounded-lg"
            >
              <Upload className="size-6 text-[var(--veda-text-primary)] lg:size-8" strokeWidth={1.6} />
            </motion.span>

            <span className="flex flex-col items-center gap-0.5">
              <span className="veda-p2-bold lg:veda-dropzone-title text-[var(--veda-text-primary)]">
                {labelPrefix}{" "}
                <span className="text-[var(--veda-orange)]">{labelHighlight}</span>
              </span>
              <span className="veda-p5 lg:veda-helper text-[var(--veda-text-muted)]">
                {error ?? "Max 10MB"}
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
