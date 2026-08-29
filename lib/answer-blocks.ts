import type { AnswerBlock } from "./types";

/**
 * Deterministic repair for answer blocks that contain more than one answer.
 *
 * The vision model decides block boundaries itself, and that decision is not
 * stable: the same 6-page script returned anywhere from 12 to 21 blocks across
 * runs. When it merges two answers into one block, the consequences are silent
 * and severe — a block holding "...end of A7 ... A 8) contract Dog is Animal..."
 * gets mapped to Q7 (it *opens* with Q7's content), so Q8 is reported
 * "unanswered" and the student loses those marks with nothing in the UI to
 * suggest anything went wrong.
 *
 * The fix does not ask the model to try harder. The boundary is already written
 * on the page — students label their answers — so we find that label ourselves
 * and cut there. A label only counts when it starts a line and is not the very
 * first thing in the block, since a block opening with "A 8)" is correct as-is;
 * it is a label appearing *mid-block* that means two answers got glued together.
 */

/**
 * A line-leading answer label: "A 8)", "A1>", "Ans 7:", "Q3.", "A 11(b)".
 *
 * Deliberately narrow. It must start a line, carry an A/Ans/Answer/Q prefix, a
 * 1-2 digit number, an optional "(a)" part, and close with a bracket, colon or
 * dot. Solidity source is full of brackets and digits, so anything looser
 * starts cutting blocks in the middle of code: `mapping (uint => Candidate)`
 * and `require (_candidateID > 0 ...)` are the shapes to stay away from.
 */
const ANSWER_LABEL =
  /(?:^|\r?\n)[ \t]*(?:A|Ans|Answer|Q)[ \t.]{0,2}\d{1,2}[ \t]*(?:\([a-z]\))?[ \t]*[):.>\]]/gi;

/**
 * Longest leading run still treated as a heading rather than an answer. Two
 * short lines; the merged tails this function targets run to several hundred
 * characters, so there is a wide margin between the two cases.
 */
const HEADING_MAX_CHARS = 80;

/** True when the text opens with an answer label rather than merely containing one. */
function startsWithLabel(text: string): boolean {
  return new RegExp(ANSWER_LABEL.source, "i").test(`\n${text}`.slice(0, 40));
}

/** Character offsets where a new labelled answer starts, ignoring offset 0. */
function labelOffsets(text: string): number[] {
  const offsets: number[] = [];

  for (const match of text.matchAll(ANSWER_LABEL)) {
    // matchAll gives the index of the newline the pattern consumed; the label
    // itself starts after it (and after any leading indentation).
    const raw = match[0];
    const lead = raw.length - raw.replace(/^(?:\r?\n)[ \t]*/, "").length;
    const start = (match.index ?? 0) + lead;

    // A label at the very start is this block's own heading, not a seam.
    if (start > 0) offsets.push(start);
  }

  return offsets;
}

/**
 * Splits one block's bbox by character position.
 *
 * This is an estimate and worth being honest about: it assumes text is
 * distributed evenly down the block, so a segment covering 40% of the
 * characters is given the top 40% of the box. Real handwriting is not uniform —
 * a dense code listing under a short heading will skew it — so the derived
 * boxes can be off by a line or two vertically. Only the y-axis is divided; x
 * is left alone, because a merged block spans the same column either way.
 *
 * The alternative was to give every fragment the full original box, which
 * highlights a whole page-worth of writing for a two-line answer. An estimate
 * that is roughly right beats a box that is confidently wrong, and the split is
 * what makes the answer gradeable at all.
 */
function sliceBbox(
  bbox: AnswerBlock["bbox"],
  from: number,
  to: number,
  total: number,
): AnswerBlock["bbox"] {
  const [ymin, xmin, ymax, xmax] = bbox;
  if (total <= 0) return bbox;

  const height = ymax - ymin;
  const top = ymin + (height * from) / total;
  const bottom = ymin + (height * to) / total;

  return [Math.round(top), xmin, Math.round(bottom), xmax];
}

/**
 * Splits any block that carries a second answer label mid-text.
 *
 * Order is preserved, and a block with no embedded label passes through
 * untouched (same object, same id), so this is a no-op on the runs where the
 * model already got the boundaries right.
 */
export function splitLabelledAnswers(blocks: AnswerBlock[]): AnswerBlock[] {
  const out: AnswerBlock[] = [];

  for (const block of blocks) {
    const text = block.transcribedText ?? "";
    const offsets = labelOffsets(text);

    if (offsets.length === 0) {
      out.push(block);
      continue;
    }

    const bounds = [0, ...offsets, text.length];

    // A short, unlabelled run before the first label is a heading for the
    // answer that follows ("Byzantine Generals" sitting above "A 4) ..."), not
    // an answer of its own. Fold it forward instead of emitting a sliver block
    // that would show up in triage as stray unmatched writing. A *long* leading
    // run is the real case this function exists for — the tail of the previous
    // answer — so it stays separate.
    const lead = text.slice(bounds[0], bounds[1]).trim();
    if (lead && lead.length <= HEADING_MAX_CHARS && !startsWithLabel(lead)) {
      bounds.splice(1, 1);
    }

    let part = 0;

    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      const segment = text.slice(from, to).trim();
      if (!segment) continue;

      part += 1;
      out.push({
        ...block,
        // The first fragment keeps the original id so it stays traceable back
        // to what the model returned; later fragments are suffixed. "-2" cannot
        // collide with a sibling like "p6-2" because it extends a full id.
        id: part === 1 ? block.id : `${block.id}-${part}`,
        transcribedText: segment,
        bbox: sliceBbox(block.bbox, from, to, text.length),
        // Only the opening fragment can be a continuation of the previous page.
        // The rest begin at their own label, so by definition they do not.
        continuesFromPrevious:
          part === 1 ? (block.continuesFromPrevious ?? false) : false,
      });
    }
  }

  return out;
}
