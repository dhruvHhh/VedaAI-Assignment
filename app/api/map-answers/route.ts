import { NextResponse } from "next/server";
import { mapAnswers } from "@/lib/reasoning";
import {
  backfillMissingBlocks,
  backfillMissingQuestions,
} from "@/lib/mapping-repair";
import type { AnswerBlock, Question } from "@/lib/types";
import { errorResponse } from "../_shared";

export const runtime = "nodejs";
// Measured at 2.4-4.3s (text-only, no images); 60 is ample.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { questions, answerBlocks } = (await request.json()) as {
      questions?: Question[];
      answerBlocks?: AnswerBlock[];
    };

    if (!Array.isArray(questions) || !Array.isArray(answerBlocks)) {
      return NextResponse.json(
        { error: "Body must be { questions: Question[], answerBlocks: AnswerBlock[] }." },
        { status: 400 },
      );
    }

    const mappings = await mapAnswers(questions, answerBlocks);

    return NextResponse.json({
      mappings: backfillMissingBlocks(
        backfillMissingQuestions(mappings, questions),
        answerBlocks,
      ),
    });
  } catch (error) {
    return errorResponse("map-answers", error);
  }
}
