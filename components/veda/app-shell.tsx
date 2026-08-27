"use client";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { cn } from "@/lib/utils";

/**
 * Page chrome shared by every screen: sidebar (desktop) / top bar, sitting on
 * the frame's own background fill.
 *
 * The Figma frames use three distinct backgrounds, so the caller passes the
 * right one rather than the shell assuming a single global treatment:
 *   "upload"   -> fill_34b35bf5          (Upload Empty + Filled, desktop)
 *   "gradient" -> Background/bg - Gradient (Loading + Mapping, all phone)
 */
export function AppShell({
  background = "gradient",
  ambient = false,
  collapsedSidebar = false,
  children,
  contentClassName,
}: {
  background?: "upload" | "gradient";
  /** The two blurred ellipses that glow behind the upload frames. */
  ambient?: boolean;
  /** Loading and Mapping use the 64px icon rail; Upload uses the full nav. */
  collapsedSidebar?: boolean;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-dvh w-full overflow-hidden p-3 lg:gap-3",
        background === "upload" ? "bg-veda-upload" : "bg-veda-gradient",
      )}
    >
      {ambient && <AmbientGlow />}

      <Sidebar collapsed={collapsedSidebar} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-3">
        <TopBar />
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[40px]",
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * effect_816f4732 — two 428px-tall ellipses with blur(200px) sitting low in
 * the frame, which is what gives the upload screen its soft dark footer glow.
 */
function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute rounded-[50%]"
        style={{
          left: "15.7%",
          top: "86%",
          width: "91.5%",
          height: "54%",
          background: "rgba(23, 23, 23, 0.4)",
          filter: "var(--veda-ambient-blur)",
        }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{
          left: "22.4%",
          top: "115%",
          width: "77.3%",
          height: "54%",
          background: "rgba(76, 76, 76, 0.4)",
          filter: "var(--veda-ambient-blur)",
        }}
      />
    </div>
  );
}
