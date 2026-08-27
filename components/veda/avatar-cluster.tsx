"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { CloudLightning, Clock, LayoutGrid, Settings } from "lucide-react";

/**
 * The decorative student badge above the dropzones (Figma EL-5dc4e5da).
 *
 * Two concentric orange halos, a white disc with the student photo, and four
 * small orange-gradient chips pinned around the ring. Positions below are the
 * Figma offsets converted to percentages of the 138px ring / 113x111 chip box.
 */

const CHIPS = [
  { Icon: LayoutGrid, left: "0%", top: "29.1%" }, // Task Square
  { Icon: Clock, left: "62.7%", top: "0%" },
  { Icon: CloudLightning, left: "88.7%", top: "62.7%" },
  { Icon: Settings, left: "24.6%", top: "88.5%" },
];

export function AvatarCluster() {
  return (
    <div className="relative size-[138px] shrink-0">
      {/* outer halo — rgba(255,86,35,0.1) */}
      <div className="absolute inset-0 rounded-full bg-[rgba(255,86,35,0.1)] backdrop-blur-[1.7px]" />
      {/* inner halo — rgba(255,86,35,0.26), 108px inset 15/15.6 */}
      <div className="absolute left-[10.9%] top-[11.3%] size-[78.3%] rounded-full bg-[rgba(255,86,35,0.26)]" />

      {/* white disc + photo */}
      <div className="absolute left-[21.9%] top-[8.3%] h-[70.1%] w-[57%]">
        <div className="absolute bottom-0 left-0 h-[80.3%] w-full rounded-full bg-white" />
        <Image
          src="/figma/student-avatar.png"
          alt="Student"
          width={158}
          height={194}
          className="absolute inset-0 size-full rounded-[52.7px] object-cover object-top"
        />
      </div>

      {/* orbiting feature chips */}
      <div className="absolute left-[8.7%] top-[9.6%] h-[80.7%] w-[81.9%]">
        {CHIPS.map(({ Icon, left, top }, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 400, damping: 18 }}
            style={{ left, top }}
            className="bg-veda-orange-gradient absolute grid size-[12.8px] place-items-center rounded-full"
          >
            <Icon className="size-[7px] text-white" strokeWidth={2.5} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}
