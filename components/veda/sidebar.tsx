"use client";

import {
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  ChevronsRight,
  Sparkles,
  PanelLeft,
  Settings,
  Users,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Desktop sidebar — Figma instance "Side Bar" (1:8663).
 * 304x763, 24px padding, white, 16px radius, "realistic shadow".
 * Hidden below lg; the phone frames replace it with <MobileTopBar />.
 */

/**
 * Brand mark. Lives in public/ so it is served as a static asset — a file in
 * lib/ would only be reachable through a bundler import.
 *
 * object-contain rather than cover: a logo should never be cropped to fill the
 * tile, even if its aspect ratio is not square.
 */
function VedaLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/veda-logo.jpg"
      alt="VedaAI"
      width={40}
      height={40}
      priority
      className={cn("size-10 shrink-0 rounded-xl object-contain", className)}
    />
  );
}

const NAV_ITEMS = [
  { label: "Home", icon: Home },
  { label: "My Classroom", icon: Users },
  { label: "Assignments", icon: FileText },
  { label: "Exams", icon: ClipboardList, active: true },
  { label: "My Library", icon: BookOpen },
];

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  // The Loading and Mapping frames both use the 64px icon-only rail
  // (Figma EL-8b6d2e4b) to give the working area more room.
  if (collapsed) return <CollapsedSidebar />;

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col justify-between items-center",
        "w-[304px] rounded-2xl bg-white p-6 shadow-veda-realistic",
      )}
    >
      {/* --- top: brand, product pill, nav ------------------------------- */}
      <div className="flex w-full flex-col items-center gap-14">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <VedaLogo />
            <span className="veda-wordmark text-[var(--veda-text-primary)]">
              VedaAI
            </span>
          </div>
          <PanelLeft className="size-5 text-[var(--veda-text-secondary)]" />
        </div>

        {/* "AI Teacher's Toolkit" pill — #272727 with an orange gradient ring */}
        <div className="w-[251px]">
          <div
            className="relative flex h-[42px] items-center justify-center rounded-full bg-[#272727] px-4"
            style={{
              boxShadow:
                "0px 32px 48px 0px rgba(255,255,255,0.2), 0px 16px 48px 0px rgba(255,255,255,0.12), inset 0px 0px 34.5px 0px rgba(255,255,255,0.25), inset 0px -1px 3.5px 0px rgba(177,177,177,0.6)",
              outline: "4px solid transparent",
              backgroundImage:
                "linear-gradient(#272727, #272727), linear-gradient(180deg, rgba(255,121,80,1) 0%, rgba(192,53,10,1) 100%)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box, border-box",
              border: "4px solid transparent",
            }}
          >
            <span className="text-[16px] font-medium leading-7 tracking-[-0.04em] text-white">
              AI Teacher&rsquo;s Toolkit
            </span>
          </div>
        </div>

        <nav className="flex w-[251px] flex-col gap-2">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-[9px] text-left transition-colors",
                active
                  ? "veda-p3-medium bg-[var(--veda-offwhite-20)] text-[var(--veda-text-primary)]"
                  : "veda-p3 text-[var(--veda-text-secondary)] hover:bg-[var(--veda-offwhite-20)]/60",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* --- bottom: settings + school card ------------------------------ */}
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          className="veda-p3 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--veda-text-secondary)] hover:bg-[var(--veda-offwhite-20)]/60"
        >
          <Settings className="size-5 shrink-0" />
          Settings
        </button>

        <div className="flex items-center gap-2 rounded-2xl bg-[var(--veda-offwhite-20)] p-3">
          <div className="grid size-[59px] shrink-0 place-items-center rounded-lg bg-white">
            <GraduationCap className="size-7 text-[var(--veda-text-secondary)]" />
          </div>
          <div className="min-w-0">
            <p className="veda-p3-bold truncate text-[var(--veda-text-primary)]">
              Delhi Public School
            </p>
            <p className="veda-p4 truncate text-[var(--veda-bg-dark)]">
              Bokaro Steel City
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Collapsed rail — Figma EL-8b6d2e4b: 64px wide, 12px/24px padding, white,
 * 16px radius, "realistic shadow", icons only with an expand affordance.
 */
function CollapsedSidebar() {
  return (
    <aside className="hidden shrink-0 flex-col items-center justify-between rounded-2xl bg-white px-6 py-3 shadow-veda-realistic lg:flex lg:w-16">
      <div className="flex flex-col items-center gap-14">
        <VedaLogo />

        <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#272727]">
          <Sparkles className="size-[18px] text-white" />
        </div>

        <nav className="flex flex-col items-center gap-2">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              className={cn(
                "grid size-9 place-items-center rounded-lg transition-colors",
                active
                  ? "bg-[var(--veda-offwhite-20)] text-[var(--veda-text-primary)]"
                  : "text-[var(--veda-text-secondary)] hover:bg-[var(--veda-offwhite-20)]/60",
              )}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="grid size-9 place-items-center rounded-lg bg-[var(--veda-offwhite-20)]">
          <GraduationCap className="size-5 text-[var(--veda-text-secondary)]" />
        </div>
        <button
          type="button"
          aria-label="Expand sidebar"
          className="grid size-9 place-items-center rounded-lg text-[var(--veda-text-secondary)] hover:bg-[var(--veda-offwhite-20)]/60"
        >
          <ChevronsRight className="size-5" />
        </button>
      </div>
    </aside>
  );
}
