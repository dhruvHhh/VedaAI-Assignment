# VedaAI — AI Teacher's Toolkit
A teacher uploads a question paper and a student's handwritten answer sheet. The app
reads both, figures out which answer goes with which question, highlights that answer
on the scan, and grades it with a bit of written feedback.

Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui, built against the Figma
designs I was given.

![Mapping screen with an out-of-order answer highlighted](docs/images/mapping-out-of-order.png)

## What it does

1. **Upload** — question paper and answer sheet, PDF or image, 10MB each.
2. **Extract** — questions come out with their printed numbering intact, including
   sub-parts like `11(a)` / `11(b)`. Handwriting gets transcribed into separate answer
   blocks, each with a bounding box saying where it sits on the page.
3. **Map** — each answer block gets matched to a question by meaning rather than by
   position, with a confidence score. Questions nobody answered are marked
   `unanswered`; writing that doesn't belong to any question is `unmatched`.
4. **Grade** — every matched answer gets a score out of a max the model works out from
   the question, plus feedback.

## Screens

| Screen | What it does |
| --- | --- |
| **Upload — empty** | Two dropzones (Question Paper, Answer Sheet). PDF or image, max 10MB. "Start Mapping" stays disabled until both are there. |
| **Upload — filled** | Each dropzone shows filename, size and page count, with a remove button. |
| **Loading** | Sparkle animation and "Extracting…" while the pipeline runs. |
| **Mapping** | Left: the extracted questions, each one collapsible with a score badge and AI feedback. Right: the answer sheet with zoom, page navigation, and a coloured box drawn over whichever answer you've selected. On phones these become two tabs instead of a split view. |

The two panels scroll independently inside a fixed viewport, so the page itself never
scrolls.

## Architecture

Four steps, split across three providers:

| Step | Provider | Model |
| --- | --- | --- |
| Extract questions | Google Gemini | `gemini-3.5-flash-lite` |
| Extract answers | Google Gemini | `gemini-3.5-flash-lite` |
| Map answers → questions | Groq | `openai/gpt-oss-120b` |
| Grade all answers | Anthropic (primary) | `claude-sonnet-5` |
| ↳ on any failure | Groq (fallback) | `openai/gpt-oss-120b` |

I split it this way because of free-tier quota. Gemini is the only provider here that
can actually look at an image, and it's the tighter limit — reading a printed paper and
transcribing handwriting both need vision, and the answer extraction also has to return
bounding boxes grounded in the page image. Mapping and grading never touch the image at
all: by the time they run, the handwriting is already text. So those two go elsewhere and
the scarce vision quota stays with the two steps that genuinely need it.

Grading is one batched call for the whole paper rather than one call per question. That
was the single biggest thing for staying inside the free tier — a 30-question paper
costs the same one call as a 3-question paper. That stays true whichever provider marks
it; batching is a property of the prompt, not the provider.

Grading goes to Claude first because it writes noticeably better feedback for a student
to read, and falls back to Groq automatically on *any* failure — rate limit, timeout,
outage, malformed output, exhausted credit. The fallback isn't a redundant deployment
concern so much as an honest one: this runs on free and trial tiers, and a grading step
that dies when a quota runs out isn't much use to a teacher. The server log records which
provider actually served each call.

That works out to **4 API calls per session**, no matter how long the paper is: 2 Gemini
(the extractions run concurrently), 1 Groq for mapping, and 1 for grading. The *count* is
fixed; the provider mix isn't. In the happy path grading is Claude, so it's 2 Gemini +
1 Groq + 1 Anthropic. If Claude fails, that grading call becomes a Groq call instead —
still 4 total, just 2 Groq. A failed Claude attempt doesn't add to the count in any way
that costs quota, since a request that errors isn't a request that graded anything.

```
 upload ──► /api/extract-questions ─┐
                                    ├─► /api/map-answers ──► /api/grade ──► mapping screen
 upload ──► /api/extract-answers  ──┘
```

All four routes run on the Node runtime. PDF pages get rasterised at 2x with
`pdfjs-dist` + `@napi-rs/canvas` before going to the vision model.

### Where things live

```
app/api/              four route handlers, one per pipeline step
lib/vision.ts         Gemini: question + answer extraction, bbox normalisation
lib/reasoning.ts      Groq: mapping + batched grading
lib/pdf-to-images.ts  PDF → 2x page images
lib/llm-json.ts       defensive JSON parsing shared by both providers
lib/api.ts            the only module that knows where data comes from
lib/types.ts          the backend contract (Question, AnswerBlock, Mapping, GradeResult)
hooks/use-toolkit.ts  flow state; joins questions ↔ mappings ↔ grades
components/veda/      the screens
```

`lib/api.ts` is the one seam between the UI and the data. Components and hooks only ever
call `runExtractionPipeline()`, so switching between mock and live data doesn't touch
anything else.

## Setup

Needs **Node 22.13+** — that floor comes from `pdfjs-dist` (Next itself only needs
20.9+). `@napi-rs/canvas` is a native binding, so install it on whatever machine runs the
server instead of copying `node_modules` between platforms.

```bash
npm install
cp .env.local.example .env.local   # then fill in the two keys
npm run dev                        # http://localhost:3000
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes (unless mocking) | Question and answer extraction. Free key: <https://aistudio.google.com/apikey> |
| `ANTHROPIC_API_KEY` | no (grading falls back) | Grading, as the primary provider. Without it every grading call falls through to Groq. Key: <https://console.anthropic.com/settings/keys> |
| `GROQ_API_KEY` | yes (unless mocking) | Mapping, and the grading fallback. Free key: <https://console.groq.com/keys> |
| `NEXT_PUBLIC_USE_MOCK_DATA` | no | `true` runs the whole flow off `lib/mock-data.ts` — no keys, no network. Anything else uses the real routes. |

The free tiers cover this fine at 4 calls a session. Restart the dev server after
changing env vars.

### If you'd rather not set up keys

Set `NEXT_PUBLIC_USE_MOCK_DATA=true` and you can click through all four screens against
a fixture with 12 questions (including `11(a)` / `11(b)`), one unanswered question, one
unmatched stray block, and one answer that spans a page break. It's the quickest way to
look at the UI.

## Confidence and the "Needs review" toggle

This part isn't obvious from the UI on its own, so:

every mapping comes back with a `confidence` from the model. Below
`LOW_CONFIDENCE_THRESHOLD` (currently **0.90**, in `components/veda/bbox-overlay.tsx`)
the question row gets a muted amber **Review** tag next to its score, and the box on the
scan is drawn dashed instead of solid — same colour, just less certain.

The 0.90 isn't a number I picked by feel. I measured it. In practice `openai/gpt-oss-120b`
only really uses a narrow band: about **0.95–0.99** when the answer literally has the
question number written on it ("Ans 7:"), and **0.80–0.88** when it had to work the match
out from the content. It basically never drops below 0.8, even on fragments I made
deliberately ambiguous to try and push it down. So my first instinct of 0.6 was useless —
nothing would ever have tripped it. 0.90 is the line that actually separates "the student
numbered this" from "the model figured this out", and the second group is the one a
teacher should glance at.

The **Needs review** toggle reorders the list rather than filtering it: unanswered
questions first, then unmatched stray writing, then the low-confidence matches, with the
confident ones still below and dimmed. Nothing disappears.

![Needs review triage on a phone](docs/images/mobile-needs-review.png)

## Testing

I tested this against synthetic scanned papers — out-of-order answers, answers spanning a
page break, unanswered questions, stray unmatched writing, mobile layout, and whether the
confidence score meant anything. Three real bugs came out of it, all of which `tsc`,
`eslint` and `next build` were all perfectly happy with — and two of which only existed
on the deployed site, so I had to test against the live URL to find them at all. The
nastiest one returned HTTP 200 with an empty result rather than failing.

Notes are in **[docs/testing-notes.md](docs/testing-notes.md)**.
