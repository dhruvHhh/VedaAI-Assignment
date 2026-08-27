"use client";

import { AnimatePresence, motion } from "motion/react";
import { AppShell } from "@/components/veda/app-shell";
import { UploadScreen } from "@/components/veda/upload-screen";
import { LoadingScreen } from "@/components/veda/loading-screen";
import { MappingScreen } from "@/components/veda/mapping-screen";
import { useToolkit } from "@/hooks/use-toolkit";

/**
 * The AI Teacher's Toolkit flow.
 *
 * Upload -> Extracting -> Mapping, all driven by useToolkit(). All data comes
 * from lib/api.ts, so wiring the real endpoints does not touch this file.
 */
export default function Page() {
  const toolkit = useToolkit();
  const isUpload = toolkit.stage === "upload";

  return (
    <AppShell
      background={isUpload ? "upload" : "gradient"}
      ambient
      collapsedSidebar={!isUpload}
      contentClassName={toolkit.stage === "mapping" ? "gap-3" : undefined}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={toolkit.stage}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {toolkit.stage === "upload" && (
            <UploadScreen
              questionPaper={toolkit.questionPaper}
              answerSheet={toolkit.answerSheet}
              onSelect={toolkit.setFile}
              onRemove={toolkit.clearFile}
              bothUploaded={toolkit.bothUploaded}
              onStart={toolkit.startMapping}
            />
          )}

          {toolkit.stage === "extracting" && <LoadingScreen />}

          {toolkit.stage === "mapping" && toolkit.result && (
            <MappingScreen
              rows={toolkit.questionRows}
              unmatchedBlocks={toolkit.unmatchedBlocks}
              pages={toolkit.result.pages}
              activeQuestionId={toolkit.activeQuestionId}
              onSelectQuestion={toolkit.selectQuestion}
              currentPage={toolkit.currentPage}
              onPageChange={toolkit.setCurrentPage}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {toolkit.error && (
        <p className="veda-p4 shrink-0 pb-2 text-center text-[#C0350A]">
          {toolkit.error}
        </p>
      )}
    </AppShell>
  );
}
