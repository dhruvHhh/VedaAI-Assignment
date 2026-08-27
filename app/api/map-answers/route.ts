import { NextResponse } from "next/server";
import { mapAnswers } from "@/lib/reasoning";
import type { AnswerBlock, Mapping, Question } from "@/lib/types";
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
      mappings: backfillMissingQuestions(mappings, questions),
    });
  } catch (error) {
    return errorResponse("map-answers", error);
  }
}

/**
 * The model is told every question must appear exactly once, but a long paper
 * can still lose one. Anything missing comes back as "unanswered" rather than
 * silently vanishing from the teacher's list.
 */
function backfillMissingQuestions(
  mappings: Mapping[],
  questions: Question[],
): Mapping[] {
  const covered = new Set(
    mappings.map((m) => m.questionId).filter((id): id is string => Boolean(id)),
  );

  const missing: Mapping[] = questions
    .filter((question) => !covered.has(question.id))
    .map((question) => ({
      questionId: question.id,
      answerBlockIds: [],
      status: "unanswered" as const,
      confidence: 1,
    }));

  return [...mappings, ...missing];
}
