# VedaAI — AI Teacher's Toolkit

A teacher uploads a question paper and a student's handwritten answer sheet. The
app reads both, works out which answer belongs to which question, highlights the
matching region on the scan, and grades each answer with written feedback.

Built with Next.js 16 (App Router), TypeScript, Tailwind v4 and shadcn/ui, against
the provided Figma designs.

![Mapping screen with an out-of-order answer highlighted](docs/images/mapping-out-of-order.png)

## What it does

1. **Upload** — a question paper and an answer sheet, PDF or image, 10MB each.
2. **Extract** — questions are pulled from the paper with their printed numbering
   (including sub-parts like `11(a)` / `11(b)`); handwriting is transcribed into
   discrete answer blocks, each with a bounding box locating it on the page.
3. **Map** — each answer block is matched to the question it answers, by meaning
   rather than by position, with a confidence score. Questions with no answer are
   marked `unanswered`; writing that belongs to no question is `unmatched`.
4. **Grade** — every matched answer is scored with a mark out of a maximum the
   model infers from the question, plus a short piece of feedback.

## Screens

| Screen | What it does |
| --- | --- |
| **Upload — empty** | Two dropzones (Question Paper, Answer Sheet). PDF or image, max 10MB. "Start Mapping" stays disabled until both are present. |
| **Upload — filled** | Each dropzone shows filename, size and page count with a remove button. |
| **Loading** | Sparkle animation, "Extracting…", while the pipeline runs. |
| **Mapping** | Left: scrollable list of extracted questions, each collapsible with a score badge and AI feedback. Right: the answer sheet with zoom, page navigation, and a coloured bounding box over the answer for the selected question. On phones the two panels become tabs. |

Both panels scroll independently inside a fixed viewport — the page itself never
scrolls.

## Architecture

The pipeline is split across two providers, deliberately:

| Step | Provider | Model | Why |
| --- | --- | --- | --- |
| Extract questions | Google Gemini | `gemini-3.5-flash-lite` | Needs vision — reads a printed page. |
| Extract answers | Google Gemini | `gemini-3.5-flash-lite` | Needs vision — transcribes handwriting **and** returns bounding boxes grounded in the page image. |
| Map answers → questions | Groq | `openai/gpt-oss-120b` | Text only. Operates on strings Gemini already transcribed. |
| Grade all answers | Groq | `openai/gpt-oss-120b` | Text only, and **batched into one call** for the whole paper. |

**Why split it.** Gemini's free tier is the tighter constraint, and it is the only
one of the two that can look at pixels. Mapping and grading never need the image —
by the time they run, the handwriting is already text. Routing them to Groq keeps
the scarce vision quota for the two steps that genuinely require it.

**Why grading is one call.** Grading is batched into a single request containing
every question/answer pair, rather than one request per question. A 30-question
paper costs the same one call as a 3-question paper, which is what keeps a full
session inside free-tier limits.

**One session = 4 API calls**, fixed, regardless of paper length: 2 Gemini
(the two extractions run concurrently) + 2 Groq.

### Data flow

```
 upload ──► /api/extract-questions ─┐
                                    ├─► /api/map-answers ──► /api/grade ──► mapping screen
 upload ──► /api/extract-answers  ──┘
```

All four routes run on the Node runtime — PDF pages are rasterised at 2x with
`pdfjs-dist` + `@napi-rs/canvas` before being sent to the vision model.

### Where things live

```
app/api/          four route handlers, one per pipeline step
lib/vision.ts     Gemini: question + answer extraction, bbox normalisation
lib/reasoning.ts  Groq: mapping + batched grading
lib/pdf-to-images.ts  PDF → 2x page images
lib/llm-json.ts   defensive JSON parsing shared by both providers
lib/api.ts        the only module that knows where data comes from
lib/types.ts      the backend contract (Question, AnswerBlock, Mapping, GradeResult)
hooks/use-toolkit.ts  flow state; joins questions ↔ mappings ↔ grades
components/veda/  the screens
```

`lib/api.ts` is the single seam between UI and data. Components and hooks only
call `runExtractionPipeline()`, so switching between mock and live data changes
nothing else.

## Setup

Requires **Node 22.13+** (`pdfjs-dist` sets that floor; Next itself needs 20.9+).
`@napi-rs/canvas` is a native binding, so install it on the machine that runs the
server rather than copying `node_modules` across platforms.

```bash
npm install
cp .env.local.example .env.local   # then fill in the two keys
npm run dev                        # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes (unless mocking) | Question and answer extraction. Free key: <https://aistudio.google.com/apikey> |
| `GROQ_API_KEY` | yes (unless mocking) | Mapping and grading. Free key: <https://console.groq.com/keys> |
| `NEXT_PUBLIC_USE_MOCK_DATA` | no | `true` runs the entire flow off `lib/mock-data.ts` — no keys, no network. Anything else uses the real routes. |

Both providers have free tiers that cover this app comfortably at 4 calls per
session. Env changes require a dev server restart.

### Running without API keys

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` to click through all four screens against a
realistic fixture — 12 questions including `11(a)` / `11(b)`, one unanswered
question, one unmatched stray block, and one answer spanning a page break. This is
the fastest way to review the UI.

## Confidence and the "Needs review" triage

Not self-evident from the UI, so worth stating plainly.

Every mapping carries a `confidence` from the model. Below
`LOW_CONFIDENCE_THRESHOLD` (currently **0.90**, in
`components/veda/bbox-overlay.tsx`) two things change:

- the question row shows a muted amber **Review** tag next to its score, and
- the bounding box on the scan is drawn **dashed** instead of solid — same colour,
  lower certainty.

**The 0.90 figure is measured, not a guess.** `openai/gpt-oss-120b` emits a narrow
band in practice: roughly **0.95–0.99** when the answer literally carries the
question's number ("Ans 7:"), and **0.80–0.88** when the match had to be inferred
from meaning alone. It effectively never goes below 0.8, even on deliberately
ambiguous fragments. A lower threshold like 0.6 is unreachable and the flag would
never fire. 0.90 cleanly separates "the student numbered this" from "the model
worked this out" — which is exactly the set a teacher should glance at.

The **Needs review** toggle above the question list reorders rather than filters:
unanswered questions first, then unmatched stray writing, then low-confidence
matches, with confident matches still below and de-emphasised. Nothing is hidden.

![Needs review triage on a phone](docs/images/mobile-needs-review.png)

## Testing

The app was verified end to end against synthetic scanned papers, covering
out-of-order answers, multi-page answer spanning, unanswered and unmatched cases,
mobile layout, and confidence calibration — and two real bugs were found that
type-checking and the build both passed over.

See **[docs/testing-notes.md](docs/testing-notes.md)**.
