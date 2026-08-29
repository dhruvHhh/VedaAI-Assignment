import type { AnswerBlock, Mapping, Question } from "./types";

/**
 * Post-conditions the mapping step must satisfy regardless of what the model
 * returned: every question appears exactly once, and every answer block appears
 * exactly once.
 *
 * The prompt asks for both, and the model usually complies, but "usually" is
 * the problem — when it silently omits something, a student's work disappears
 * from the teacher's screen with no error anywhere. These run on every response
 * and are cheap; they do not call the model again.
 *
 * Kept out of the route module so they can be tested directly.
 */

/**
 * Questions the model forgot come back as "unanswered" rather than vanishing
 * from the list.
 */
export function backfillMissingQuestions(
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

/**
 * The other half of the same guarantee, and the half that was missing.
 *
 * Observed on a 14-block script: the model returned a well-formed response that
 * simply left four blocks out. They vanished — no error, no triage entry,
 * nothing on screen to suggest a student's answers had been dropped, and the
 * four questions they belonged to were reported unanswered. A block the model
 * could not place should say so out loud, which is what "unmatched" already
 * means and how stray rough work is already handled.
 *
 * Duplicates are trimmed for the same reason: a block claimed by two questions
 * would be graded twice, so the first mapping keeps it and later ones lose it.
 */
export function backfillMissingBlocks(
  mappings: Mapping[],
  answerBlocks: AnswerBlock[],
): Mapping[] {
  const seen = new Set<string>();

  const deduped = mappings.map((mapping) => {
    const ids = mapping.answerBlockIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return ids.length === mapping.answerBlockIds.length
      ? mapping
      : { ...mapping, answerBlockIds: ids };
  });

  const dropped = answerBlocks.filter((block) => !seen.has(block.id));
  if (dropped.length > 0) {
    console.log(
      `[map-answers] model dropped ${dropped.length} block(s), surfacing as unmatched: ${dropped
        .map((b) => b.id)
        .join(", ")}`,
    );
  }

  return [
    ...deduped,
    ...dropped.map((block) => ({
      questionId: null,
      answerBlockIds: [block.id],
      status: "unmatched" as const,
      confidence: 1,
    })),
  ];
}
