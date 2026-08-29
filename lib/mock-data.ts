import type {
  AnswerBlock,
  AnswerSheetPage,
  ExtractionResult,
  GradeResult,
  Mapping,
  Question,
} from "./types";

/**
 * Stand-in for the extraction pipeline's output — a Class 10 Science paper,
 * 12 questions across 4 scanned pages.
 *
 * Deliberate edge cases, so every UI state is reachable without a backend:
 *   - Q7        -> status "unanswered" (student skipped it, scored 0)
 *   - ab-stray  -> status "unmatched"  (writing that maps to no question)
 *   - 11(a)/(b) -> labelled sub-parts
 *   - ab-05b    -> continuesFromPrevious, an answer spilling onto page 3
 */

const mockQuestions: Question[] = [
  {
    id: "1",
    text: "Define the term 'atomic number'. How does it differ from mass number?",
    page: 1,
    order: 1,
  },
  {
    id: "2",
    text: "State Newton's second law of motion and derive the relation F = ma.",
    page: 1,
    order: 2,
  },
  {
    id: "3",
    text: "Name the two main products formed when methane burns completely in air.",
    page: 1,
    order: 3,
  },
  {
    id: "4",
    text: "Draw a labelled diagram of the human respiratory system.",
    page: 2,
    order: 4,
  },
  {
    id: "5",
    text: "Explain why the sky appears blue during the day and reddish at sunset.",
    page: 2,
    order: 5,
  },
  {
    id: "6",
    text: "A body of mass 5 kg is moving with a velocity of 10 m/s. Calculate its kinetic energy.",
    page: 2,
    order: 6,
  },
  {
    id: "7",
    text: "Distinguish between an exothermic and an endothermic reaction, giving one example of each.",
    page: 3,
    order: 7,
  },
  {
    id: "8",
    text: "What is meant by the resistivity of a material? State its SI unit.",
    page: 3,
    order: 8,
  },
  {
    id: "9",
    text: "List three differences between arteries and veins.",
    page: 3,
    order: 9,
  },
  {
    id: "10",
    text: "Why is the process of respiration considered an exothermic reaction?",
    page: 4,
    order: 10,
  },
  {
    id: "11(a)",
    text: "State Ohm's law and write its mathematical expression.",
    page: 4,
    order: 11,
  },
  {
    id: "11(b)",
    text: "A resistor of 20 ohm carries a current of 0.5 A. Calculate the potential difference across it.",
    page: 4,
    order: 12,
  },
];

/**
 * bbox is [ymin, xmin, ymax, xmax], normalized 0-1000 against the page.
 */
const mockAnswerBlocks: AnswerBlock[] = [
  {
    id: "ab-01",
    page: 1,
    bbox: [96, 82, 214, 918],
    transcribedText:
      "Atomic number is the number of protons present in the nucleus of an atom. It is denoted by Z. Mass number is the total number of protons and neutrons, denoted by A. So atomic number counts only protons while mass number counts protons + neutrons.",
  },
  {
    id: "ab-02",
    page: 1,
    bbox: [238, 82, 430, 918],
    transcribedText:
      "Newton's second law: the rate of change of momentum of a body is directly proportional to the applied force and takes place in the direction of the force. p = mv, F = dp/dt = d(mv)/dt = m.dv/dt = ma. Taking k = 1 in SI units, F = ma.",
  },
  {
    id: "ab-03",
    page: 1,
    bbox: [455, 82, 548, 918],
    transcribedText:
      "When methane burns completely in air it forms carbon dioxide (CO2) and water (H2O), along with heat and light energy.",
  },
  {
    id: "ab-04",
    page: 2,
    bbox: [88, 82, 372, 918],
    transcribedText:
      "[Diagram] Labelled sketch of the human respiratory system showing nasal cavity, pharynx, larynx, trachea, bronchi, bronchioles, lungs and diaphragm.",
  },
  {
    id: "ab-05a",
    page: 2,
    bbox: [400, 82, 560, 918],
    transcribedText:
      "The sky appears blue because of scattering of light. Blue light has a shorter wavelength and is scattered much more strongly by the molecules of the atmosphere than red light (Rayleigh scattering).",
  },
  {
    id: "ab-05b",
    page: 3,
    bbox: [82, 82, 178, 918],
    continuesFromPrevious: true,
    transcribedText:
      "At sunset the light has to travel a longer distance through the atmosphere, so most of the blue is scattered away and mainly red light reaches our eyes. Hence the sky looks reddish.",
  },
  {
    id: "ab-06",
    page: 2,
    bbox: [588, 82, 706, 918],
    transcribedText:
      "Given m = 5 kg, v = 10 m/s. K.E. = 1/2 mv^2 = 1/2 x 5 x (10)^2 = 1/2 x 5 x 100 = 250 J. So the kinetic energy is 250 joules.",
  },
  {
    id: "ab-08",
    page: 3,
    bbox: [206, 82, 330, 918],
    transcribedText:
      "Resistivity is the resistance offered by a conductor of unit length and unit area of cross-section. rho = RA/L. Its SI unit is ohm-metre (ohm m).",
  },
  {
    id: "ab-09",
    page: 3,
    bbox: [358, 82, 542, 918],
    transcribedText:
      "1. Arteries carry blood away from the heart, veins carry blood towards the heart. 2. Arteries have thick elastic walls, veins have thinner walls. 3. Veins have valves to prevent backflow, arteries do not.",
  },
  {
    id: "ab-10",
    page: 4,
    bbox: [92, 82, 218, 918],
    transcribedText:
      "During respiration glucose combines with oxygen to release carbon dioxide, water and energy. Since energy is given out in the form of heat, respiration is an exothermic reaction.",
  },
  {
    id: "ab-11a",
    page: 4,
    bbox: [246, 82, 366, 918],
    transcribedText:
      "Ohm's law states that the current flowing through a conductor is directly proportional to the potential difference across it, provided the temperature remains constant. V = IR.",
  },
  {
    id: "ab-11b",
    page: 4,
    bbox: [394, 82, 500, 918],
    transcribedText:
      "R = 20 ohm, I = 0.5 A. V = IR = 20 x 0.5 = 10 V. The potential difference across the resistor is 10 volts.",
  },
  {
    id: "ab-stray",
    page: 4,
    bbox: [560, 82, 648, 918],
    transcribedText:
      "Rough work: 5 x 100 = 500, 500 / 2 = 250. Check units - joules. (Ask sir about Q7 numerical.)",
  },
];

/**
 * Q4, Q9 and 11(a) sit below LOW_CONFIDENCE_THRESHOLD so the dashed highlight
 * and the "Review" tag are visible without a backend.
 */
const mockMappings: Mapping[] = [
  { questionId: "1", answerBlockIds: ["ab-01"], status: "matched", confidence: 0.97 },
  { questionId: "2", answerBlockIds: ["ab-02"], status: "matched", confidence: 0.94 },
  { questionId: "3", answerBlockIds: ["ab-03"], status: "matched", confidence: 0.96 },
  { questionId: "4", answerBlockIds: ["ab-04"], status: "matched", confidence: 0.52 },
  {
    questionId: "5",
    answerBlockIds: ["ab-05a", "ab-05b"],
    status: "matched",
    confidence: 0.89,
  },
  { questionId: "6", answerBlockIds: ["ab-06"], status: "matched", confidence: 0.98 },
  // Student skipped Q7 entirely.
  { questionId: "7", answerBlockIds: [], status: "unanswered", confidence: 1 },
  { questionId: "8", answerBlockIds: ["ab-08"], status: "matched", confidence: 0.93 },
  { questionId: "9", answerBlockIds: ["ab-09"], status: "matched", confidence: 0.47 },
  { questionId: "10", answerBlockIds: ["ab-10"], status: "matched", confidence: 0.95 },
  { questionId: "11(a)", answerBlockIds: ["ab-11a"], status: "matched", confidence: 0.58 },
  { questionId: "11(b)", answerBlockIds: ["ab-11b"], status: "matched", confidence: 0.99 },
  // Rough work that belongs to no question.
  { questionId: null, answerBlockIds: ["ab-stray"], status: "unmatched", confidence: 0.42 },
];

const mockGrades: GradeResult[] = [
  {
    questionId: "1",
    score: 2,
    maxScore: 2,
    feedback:
      "Correct on both counts. You clearly separated protons (Z) from protons + neutrons (A) and used the right symbols. Full marks.",
  },
  {
    questionId: "2",
    score: 3,
    maxScore: 3,
    feedback:
      "Good derivation. You stated the law in terms of rate of change of momentum and carried the differentiation through correctly. Mentioning that k = 1 in SI units is exactly the step examiners look for.",
  },
  {
    questionId: "3",
    score: 1,
    maxScore: 1,
    feedback: "Both products named correctly with formulae. Full marks.",
  },
  {
    questionId: "4",
    score: 3,
    maxScore: 5,
    feedback:
      "The diagram is neat and most parts are labelled, but the alveoli and the pleural membrane are missing, and the diaphragm is drawn flat rather than dome-shaped. Add those three to reach full marks.",
  },
  {
    questionId: "5",
    score: 3,
    maxScore: 3,
    feedback:
      "Both halves answered well. You correctly linked shorter wavelength to stronger scattering and explained the longer atmospheric path at sunset. Naming Rayleigh scattering was a nice touch.",
  },
  {
    questionId: "6",
    score: 2,
    maxScore: 2,
    feedback:
      "Formula, substitution and unit are all correct, and you stated the final answer with the unit. Well done.",
  },
  {
    questionId: "7",
    score: 0,
    maxScore: 3,
    feedback:
      "No answer was found for this question on the answer sheet. If it was attempted elsewhere, flag it for manual review - otherwise this is a straightforward definition-plus-example question worth revisiting.",
  },
  {
    questionId: "8",
    score: 2,
    maxScore: 2,
    feedback: "Correct definition, correct formula and the right SI unit. Full marks.",
  },
  {
    questionId: "9",
    score: 3,
    maxScore: 3,
    feedback:
      "Three valid, clearly distinct differences. Structuring them as a numbered list made the answer easy to mark.",
  },
  {
    questionId: "10",
    score: 2,
    maxScore: 2,
    feedback:
      "Correct - you identified that energy is released and tied that directly to the definition of an exothermic reaction.",
  },
  {
    questionId: "11(a)",
    score: 0,
    maxScore: 2,
    feedback:
      "The statement of the law is right, but the essential condition that physical conditions stay constant is missing from the marking scheme's wording, and V = IR was written without defining the symbols. Marks withheld pending review.",
  },
  {
    questionId: "11(b)",
    score: 2,
    maxScore: 2,
    feedback: "Correct substitution and answer with the proper unit. Clean working.",
  },
];

/** The scan exported from the Figma mapping frame, reused for all 4 pages. */
const MOCK_SCAN = "/figma/answer-sheet-page.png";

const mockPages: AnswerSheetPage[] = [
  { page: 1, imageUrl: MOCK_SCAN, width: 1122, height: 1402 },
  { page: 2, imageUrl: MOCK_SCAN, width: 1122, height: 1402 },
  { page: 3, imageUrl: MOCK_SCAN, width: 1122, height: 1402 },
  { page: 4, imageUrl: MOCK_SCAN, width: 1122, height: 1402 },
];

export const mockExtractionResult: ExtractionResult = {
  questions: mockQuestions,
  answerBlocks: mockAnswerBlocks,
  mappings: mockMappings,
  grades: mockGrades,
  pages: mockPages,
};
