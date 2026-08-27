"use client";

import { ArrowLeft, ChevronDown, Menu } from "lucide-react";
import Image from "next/image";
import {
  AiSparkIcon,
  ExamsIcon,
  NotificationIcon,
  QuestionMarkIcon,
} from "./figma-icons";

/**
 * The signed-in user's avatar. Full-colour artwork with an embedded raster, so
 * it is loaded as an image rather than inlined like the monochrome icons.
 */
function UserAvatar({ className }: { className?: string }) {
  return (
    <Image
      src="/User-icon.svg"
      alt="Dhruv Honwad"
      width={32}
      height={32}
      className={className}
    />
  );
}

/**
 * Top bar.
 *
 * Desktop (Figma 1:8523): a 1100x56 pill, rgba(255,255,255,0.75), 16px radius,
 * holding back, the section label, help, notifications, an AI action
 * and the user chip.
 *
 * Phone (Figma 1:10514/1:10515): a 373x56 white 16px-radius bar with the
 * VedaAI wordmark, notifications, avatar and a menu button. The iOS status bar
 * and browser address bar in the phone frames are mockup dressing, not UI, so
 * they are not reproduced here.
 */

function CircleButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative grid size-9 shrink-0 place-items-center rounded-full bg-[var(--veda-offwhite-primary)] text-[var(--veda-text-primary)] transition-colors hover:bg-[var(--veda-offwhite-20)]"
    >
      {children}
    </button>
  );
}

export function TopBar({ title = "Exams" }: { title?: string }) {
  return (
    <>
      {/* ---------------------------- desktop ------------------------------ */}
      <header className="hidden h-14 shrink-0 items-center gap-2.5 rounded-2xl bg-[var(--veda-white-75)] py-0 pl-6 pr-2 lg:flex">
        <button
          type="button"
          aria-label="Back"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white transition-colors hover:bg-[var(--veda-offwhite-20)]"
        >
          <ArrowLeft className="size-6" />
        </button>

        <div className="flex flex-1 items-center gap-2">
          <ExamsIcon className="size-5 text-[var(--veda-disabled)]" />
          <span className="veda-label-semi text-[var(--veda-disabled)]">
            {title}
          </span>
        </div>

        <CircleButton label="Help">
          <QuestionMarkIcon className="size-6" />
        </CircleButton>

        <button
          type="button"
          aria-label="Notifications"
          className="shrink-0 rounded-full transition-opacity hover:opacity-80"
        >
          <NotificationIcon className="size-9" />
        </button>

        <button
          type="button"
          aria-label="Ask AI"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white"
        >
          <AiSparkIcon className="size-5 text-[var(--veda-dark-grey)]" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors hover:bg-white/60"
        >
          <UserAvatar className="size-9 shrink-0 rounded-full object-cover" />
          <span className="flex items-center gap-1">
            <span className="veda-label-semi text-[var(--veda-text-primary)]">
              Dhruv Honwad
            </span>
            <ChevronDown className="size-4 text-[var(--veda-text-secondary)]" />
          </span>
        </button>
      </header>

      {/* ----------------------------- phone ------------------------------- */}
      <header className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-white py-0 pl-3 pr-4 lg:hidden">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Back" className="grid size-6 place-items-center">
            <ArrowLeft className="size-5 text-[var(--veda-text-primary)]" />
          </button>
          <span className="text-[20px] font-bold leading-[1.4] tracking-[-0.06em] text-[var(--veda-text-primary)]">
            VedaAI
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" aria-label="Notifications" className="grid size-7 place-items-center">
            <NotificationIcon className="size-7" />
          </button>
          <UserAvatar className="size-7 shrink-0 rounded-full object-cover" />
          <button type="button" aria-label="Menu" className="grid size-6 place-items-center">
            <Menu className="size-5 text-[var(--veda-text-primary)]" />
          </button>
        </div>
      </header>
    </>
  );
}
