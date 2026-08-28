import { NextResponse } from "next/server";
import { gradeAllAnswers } from "@/lib/grading";
import type { AnswerBlock, Mapping, Question } from "@/lib/types";
import { errorResponse } from "../_shared";

export const runtime = "nodejs";
// Measured at 2.4-4.3s (text-only, no images); 60 is ample.
export const maxDuration = 60;

/**
 * Grades the WHOLE paper in one request.
 *
 * Takes the full { questions, mappings, answerBlocks } set and makes a single
 * batched model call, so grading costs 1 request regardless of how many
 * questions the paper has — the difference between 1 call and N for quota.
 *
 * That call goes to Claude, falling back to Groq on any failure; the server log
 * records which provider served it. See lib/grading.ts.
 */
export async function POST(request: Request) {
  try {
    const { questions, mappings, answerBlocks } = (await request.json()) as {
      questions?: Question[];
      mappings?: Mapping[];
      answerBlocks?: AnswerBlock[];
    };

    if (
      !Array.isArray(questions) ||
      !Array.isArray(mappings) ||
      !Array.isArray(answerBlocks)
    ) {
      return NextResponse.json(
        {
          error:
            "Body must be { questions: Question[], mappings: Mapping[], answerBlocks: AnswerBlock[] }.",
        },
        { status: 400 },
      );
    }

    const grades = await gradeAllAnswers(questions, mappings, answerBlocks);

    return NextResponse.json({ grades });
  } catch (error) {
    return errorResponse("grade", error);
  }
}
