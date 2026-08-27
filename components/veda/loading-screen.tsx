"use client";

import Image from "next/image";
import { motion } from "motion/react";

/**
 * Figma "Loading state" (1:9959) and "Loading state (phone)" (3:791).
 *
 * A white 24px-radius card fills the content area; inside it the AnalysingLoader
 * stacks the 128x134 sparkle mark, "Extracting..." and "This may take a while"
 * with a 15px gap.
 *
 * The Figma fills "Extracting..." with a horizontal grey gradient
 * (#303030 -> #808080 -> #303030). That is a shimmer frozen at one keyframe, so
 * it is animated here as a sweep — the Aceternity text-shimmer treatment.
 */
export function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-3xl bg-white">
      <div className="flex flex-col items-center justify-center gap-[15px] px-6">
        <motion.div
          animate={{ scale: [1, 1.06, 1], rotate: [0, 3, 0, -3, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <motion.div
            aria-hidden
            animate={{ opacity: [0.25, 0.6, 0.25], scale: [0.9, 1.15, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-[rgba(255,86,35,0.18)] blur-2xl"
          />
          <Image
            src="/figma/sparkle-loader.svg"
            alt=""
            width={129}
            height={135}
            priority
            className="relative h-[134.49px] w-[128.15px]"
          />
        </motion.div>

        <div className="flex flex-col items-center">
          <div className="flex h-9 w-[159px] items-center justify-center">
            <h1 className="veda-shimmer text-[30px] font-bold leading-9 tracking-[-0.04em]">
              Extracting...
            </h1>
          </div>
          <p className="text-center text-[20px] font-normal leading-9 tracking-[-0.06em] text-[rgba(70,70,70,0.75)]">
            This may take a while
          </p>
        </div>
      </div>
    </div>
  );
}
