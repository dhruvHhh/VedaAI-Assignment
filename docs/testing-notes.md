# Testing & verification notes

Engineering notes on how this was verified, what was deliberately tested, and what
broke along the way.

The test scripts themselves are **not committed** — they drive a real browser and
spend real API quota, so they need keys a reviewer will not have. What follows is
the record of what they did and what they found.

## Why synthetic fixtures

No real student papers were available while building this, and the input that
matters most — a phone photo of handwriting — is also the input most likely to
break things. Typed, vector-only PDFs are a poor proxy: they exercise a completely
different code path inside `pdfjs` (see the first bug below), so testing against
them gives false confidence.

So the fixtures are generated: each page is rendered to a canvas, then embedded
into a PDF as a **full-page JPEG**, which is structurally what a scan actually is.

Each fixture simulates:

| Property | How |
| --- | --- |
| Handwriting | A script/handwriting font rather than a typeface |
| Per-character jitter | Every glyph individually offset, rotated ±0.03 rad, and size-varied |
| Baseline drift | Each line randomly displaced so rows are not perfectly level |
| Page skew | The whole page rotated 1.1–1.4°, as if photographed at an angle |
| Ruled paper | Blue rules and a red margin, drawn under the writing |
| Uneven lighting | A diagonal gradient plus vignette, imitating a shadow across the page |
| Sensor noise | Per-pixel grain across all three channels |
| Compression | Encoded as JPEG at quality 0.72, so real DCT artefacts are present |

Deliberate spelling errors ("becuase", "propotional") are baked into the text to
check the transcription reproduces what is written rather than silently correcting
it. It does.

Four variants were used:

- **labelled** — answers prefixed `Ans 1:`, `Ans 3:` …
- **unlabelled** — same answers, no numbering, so mapping must work from meaning
- **spanning** — one answer overflowing the foot of page 1 and resuming mid-sentence
  on page 2 with no new label
- **shuffled** — answers physically ordered `3, 11(b), 5, 11(a), 1`, unlabelled, so
  position is actively misleading

## Edge cases tested

### Out-of-order answers

The shuffled fixture. Correctness was graded against the **content** of each mapped
block — a required pattern plus a must-not-match pattern — so "an order that happens
to line up" cannot pass.

| Question | Mapped block | Position on sheet | Result |
| --- | --- | --- | --- |
| Q1 | `block-5` | 5th (last) | pass |
| Q3 | `block-1` | 1st | pass |
| Q5 | `block-3` | 3rd | pass |
| Q11(a) | `block-4` | 4th | pass |
| Q11(b) | `block-2` | 2nd | pass |

**5 pass, 0 fail.** Q2 and Q4 correctly `unanswered`.

The `11(a)` / `11(b)` pair is the interesting case: both answers are about Ohm's
law, so topic alone cannot separate them. The law statement went to `11(a)` and the
numeric substitution (`V = 20 × 0.5 = 10 volts`) to `11(b)`, correctly.

The question list renders in **printed order** (`1, 2, 3, 4, 5, 11(a), 11(b)`), not
answer-sheet order, and selecting a question navigates the viewer to whichever page
its answer actually sits on — verified from both ends, with Q1 (physically last,
page 2) and Q3 (physically first, page 1).

### Multi-page answer spanning

The spanning fixture. Extraction produced:

```
ans-5       page 1  continuesFromPrevious: false
ans-5-cont  page 2  continuesFromPrevious: true

mapping  Q5  matched  blocks: ["ans-5", "ans-5-cont"]
```

The flag is set correctly and both blocks map to one question.

The **UI initially failed this case.** The viewer shows one page at a time and
filtered regions to the current page, so selecting Q5 highlighted only the first
half with no indication a second half existed — the answer appeared to stop
mid-sentence. Fixed by deriving every page the selected answer occupies and
surfacing them: region labels became `Q5 1/2` / `Q5 2/2`, and a strip under the
viewer header links to each part.

![Answer spanning two pages](images/answer-spanning-pages.png)

### Unanswered questions and unmatched writing

Both are first-class states, not error cases:

- A question with no answer on the sheet maps as `unanswered`, is scored 0, and
  gets feedback saying no answer was found rather than a critique of nothing.
- Stray writing (rough work, "check units V") maps as `unmatched` with
  `questionId: null`, renders as a dashed orange card in the triage view, and
  clicking it jumps the viewer to that page.
- A defensive pass in `/api/map-answers` adds any question the model omitted back
  as `unanswered`, so a question can never silently vanish from the list.

### Mobile viewport

Driven at Pixel 7 (412×915). Both tab states render correctly, Review tags and
triage ordering hold, and the "Review" word collapses to just its amber dot at
phone width while the tag itself remains.

Overlay positioning was checked numerically rather than by eye — the rendered box
was compared against the bbox the API returned in the same run:

```
api bbox: [116, 117, 225, 664]
expected: {fracTop: 0.116, fracLeft: 0.117, fracH: 0.109, fracW: 0.547}
measured: {fracTop: 0.116, fracLeft: 0.117, fracH: 0.109, fracW: 0.547}
max deviation: 0.0000
```

One cosmetic fix came out of this: the region label was a fixed 16px pill, which at
phone width swamped a ~50px-tall box and covered the first line of the answer. It
now scales down below `lg`.

### Grading provider fallback

Grading calls Claude (`claude-sonnet-5`) first and falls back to Groq
(`openai/gpt-oss-120b`) on any failure. Both paths were exercised for real; the
fallback was not inferred from reading the code.

The model id was confirmed against the live Models API rather than assumed —
`GET /v1/models/claude-sonnet-5` returns the id exactly, and reports
`thinking.types.enabled: false`, which is why the request uses adaptive thinking
and sends no `temperature` (sampling parameters were removed on this generation
and return a 400).

| Test | Where | How it was forced | Log line | Result |
| --- | --- | --- | --- | --- |
| Happy path | local | normal run | `graded via claude` | 7 grades, 4.2-4.9s |
| Happy path | **deployed** | normal run | `graded via claude` | 7 grades, 4.6s |
| Bad credentials | local | `ANTHROPIC_API_KEY` overridden to an invalid value on the dev server only | `graded via groq (fallback: AuthenticationError 401 ...)` | 7 grades, 2.7s |
| Provider outage | local | `ANTHROPIC_BASE_URL` pointed at a dead port | `graded via groq (fallback: APIConnectionError Connection error.)` | 7 grades, 2.5s |

Both failure modes were injected as environment variables on the dev process;
`.env.local` was never edited and the deployed key was never touched. The failure
paths are deliberately local-only — forcing an outage in production to watch it
recover is not a trade worth making.

The deployed happy path was run as a full session against the live URL (both
extractions, mapping, then grading), and the provider was confirmed two ways: the
`graded via claude` line in the Vercel function logs, and an independent
behavioural check that did not need log access.

That check is worth writing down, because "which model answered" is not in the
API response. The grade endpoint takes its question/answer pairs from the request
body, so a probe can be sent asking the marker to name its own model, and the same
probe run against two local servers whose provider was already known from the log:

| Provider | Response to the probe | Time |
| --- | --- | --- |
| Claude (log-confirmed) | Declines — flags it as an attempt to extract system information | 3.7s |
| Groq (log-confirmed) | Complies — "I am GPT-4, a large language model from OpenAI", identically on 3/3 runs | 1.8-2.1s |
| **Deployed** | Declines on 3/3 runs, same framing as Claude | 3.4-4.8s |

The two providers separate cleanly and repeatably, so the deployed behaviour is
attributable without reading a log at all. A useful property to keep: if the key
were ever dropped from the deployment, this probe would say "I am GPT-4" instead.

Incidentally, Claude treated the instruction embedded in the answer text as
untrusted input and refused it. That is the right instinct for a pipeline whose
model input is OCR'd handwriting that the system did not author.

Two things this shook out. The fallback reason was originally built from
`error.name`, which the SDK's error subclasses inherit as a plain `"Error"` — so
an outage logged as `fallback: Error` and said nothing. It now uses
`error.constructor.name` plus the message. And the Claude client is constructed
with `maxRetries: 0` and a 30s timeout: the SDK defaults to two retries, which on
a real outage would have burned the grade route's whole 60s budget before Groq
ever got a turn.

Worth noting the fallback path is *faster* (2.5s vs 4.2s), because a 401 or a
refused connection fails instantly. A slow failure is the case that costs
something, which is what the timeout is sized for.

### Extraction failure, and what the teacher actually sees

Forced the same reversible way as the grading fallback above: an invalid
`GEMINI_API_KEY` set on the dev process only, with `.env.local` untouched.

The good news came first — **it never hung.** The pipeline settled in 4.0s,
returned to the upload screen, kept both files loaded and left "Start Mapping"
clickable. No infinite spinner, no crash, no dead loading screen.

What it *showed* was the problem:

```
/api/extract-answers: [GoogleGenerativeAI Error]: Error fetching from
https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent:
[400 Bad Request] API key not valid. Please pass a valid API key.
[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID","domain":...
```

Three lines of raw SDK output — the endpoint URL, the model id and a nested JSON
payload with `@type` and `domain` fields — rendered in red at the very bottom of
the viewport, roughly 150px below the button you would press to recover. So the
message and the fix were nowhere near each other, it leaked internal detail, and
none of it told a teacher what to do next.

**The replacement** is an `ExtractionError` card that takes the place of the
helper text *directly under "Start Mapping"*, so the problem and the action sit
together:

- **The step name comes from the error itself.** Failures are prefixed with the
  route that threw, which is the one genuinely useful part of that text:
  `/api/extract-questions` becomes "Reading the question paper",
  `/api/extract-answers` "Reading the answer sheet", and so on.
- **The cause is classified, not invented** — rate limit / quota to "The AI
  service is busy right now", 401/403 to "rejected our credentials", network and
  timeout to "could not be reached", with a neutral fallback for anything else.
- **The raw text is preserved, not discarded**: collapsed behind a `<details>`
  disclosure and written to `console.error`. Available when something needs
  diagnosing, out of the way when it does not.
- **Files survive a failure**, so "Try again" re-runs the same two documents in
  one click rather than a re-upload. "Start over" clears everything.

Verified against the same forced failure — six checks on the failure state, plus
a happy-path control to confirm the card does not appear when nothing is wrong:

| Check | Result |
| --- | --- |
| Card renders with the plain-language message | pass |
| "Try again" actually re-runs the pipeline | pass (returns to Extracting) |
| "Start over" clears the error | pass |
| "Start over" clears the files | pass |
| Raw provider text hidden by default | pass |
| Both files still loaded after the failure | pass |
| *Control:* no card on a successful run | pass |

**An aside worth knowing before writing browser tests against this app.** Two of
those assertions reported `false` on the first run and looked like a stale-state
bug — the error card apparently surviving a reset. It was the selector. Next.js
injects its own empty `<div role="alert" aria-live="assertive"
id="__next-route-announcer__">` into every page, so a bare `[role="alert"]`
matches two elements and `count() === 0` can never be true no matter how the app
behaves. Scoping to the card (`.filter({ hasText: "failed" })`) made all seven
pass. The app was right and the test was wrong, which is the more likely of the
two often enough to be worth checking first.

### Confidence calibration

Initially **broken, and quietly so.** Every mapping returned `0.99`, including on a
deliberately messy scan. Stripping the `Ans N:` prefixes to force meaning-based
matching still returned 0.98–0.99 — and in that run a rough-work block was wrongly
absorbed into `11(b)` while confidence moved only 0.99 → 0.98. The number was not
tracking uncertainty at all.

Replacing "use the full range" in the prompt with an **anchored rubric** (explicit
bands, criteria per band, and an instruction not to default to 0.99) fixed it:

| Input | Before | After |
| --- | --- | --- |
| Labelled (`Ans 1:`) | 0.99 | 0.96–0.97 |
| Unlabelled | 0.98–0.99 | 0.80–0.88 |
| Deliberately ambiguous fragments | — | 0.85 |

The observed floor is ~0.8 even on genuinely ambiguous input, which is why
`LOW_CONFIDENCE_THRESHOLD` is 0.90 rather than a more intuitive 0.6 — see the
README section on this.

### Bounding box quality

Across runs, `normalizeBbox` reported every box arriving clean: no inverted
min/max, no out-of-range clamping, no whole-page boxes. The raw coordinates are
accurate — on one fixture `xmin` came back as `117/1000` against a true left margin
of 62pt on a 612pt page, i.e. correct to the rounding.

The normalisation is still kept, because Gemini did initially return `bbox` **nested
one level** (`[[ymin, xmin, ymax, xmax]]`), which failed a strict length-4 check and
sent every box to the fallback. Tightening the prompt with an explicit
correct/incorrect example fixed the output; the unwrapping code remains as a net.

## Five real bugs found

All five passed `tsc --noEmit`, `eslint` and `next build` cleanly. None was
detectable without executing the real thing, and the third was not detectable
locally at all.

### 1. `@napi-rs/canvas` vs `node-canvas`

**Symptom.** `/api/extract-questions` and `/api/extract-answers` both returned 500
with `TypeError: Image or Canvas expected`, thrown inside pdf.js at
`paintInlineImageXObject` → `ctx.drawImage(...)`.

**Why it hid.** It only fires on a PDF page that contains an embedded raster image.
The early fixtures were vector text only, so `paintImageXObject` never ran. Every
scanned page hits it immediately.

**Root cause.** Not a missing canvas factory — pdf.js v6 already selects a
`NodeCanvasFactory` automatically in Node. That factory is written against
`@napi-rs/canvas`:

```js
class NodeCanvasFactory extends BaseCanvasFactory {
  _createCanvas(width, height) {
    const canvas = require("@napi-rs/canvas");   // not node-canvas
```

The project had `canvas` (node-canvas) installed instead. Mixing the two means
pdf.js hands a foreign object to a node-canvas 2D context, which rejects anything
that is not its own `Image`/`Canvas`.

**Fix.** Swapped to `@napi-rs/canvas` and removed `canvas`. An explicit
`CanvasFactory` is also passed to `getDocument()` — not required for the fix, but it
makes the dependency explicit rather than relying on pdf.js resolving it internally
through the bundler. Note the option is `CanvasFactory` with a capital C in v6, and
it takes the class, not an instance.

A related earlier fix: `pdfjs-dist` and `@napi-rs/canvas` are both listed in
`serverExternalPackages` in `next.config.ts`. Bundling pdf.js rewrites the runtime
relative import of its fake worker and it fails to load.

### 2. Panels stacked instead of side by side

**Symptom.** At 1440px the mapping screen rendered the question list and the answer
sheet vertically stacked, not as the two-column split the design calls for.

**Why it hid.** Pure CSS cascade. Nothing in TypeScript or the build can see it —
it only appears in a real browser render, which is how it was caught.

**Root cause.** shadcn's `Tabs` root ships `data-horizontal:flex-col`, compiling to:

```css
.data-horizontal\:flex-col[data-orientation="horizontal"] { flex-direction: column }
```

That selector scores **0,2,0** (class + attribute). The override was `lg:flex-row`,
which scores **0,1,0** — media queries contribute no specificity. The column rule
therefore won at every width.

**Fix.** `lg:flex-row!`, matching the `lg:flex!` already used on the panels to
override Radix's `hidden` on the inactive tab. The comment in
`components/veda/mapping-screen.tsx` explains why, because the `!` looks removable
and is not.

### 3. Text PDFs rendering blank on Vercel only

**Symptom.** `/api/extract-questions` returned HTTP 200 with `questions: []` for a
question paper that extracted seven questions perfectly on localhost. No error, no
warning, no stack trace — a clean success response with nothing in it.

**Why it hid.** This is the worst shape a bug can take. The pipeline did not fail;
it succeeded at doing nothing. Dumping the returned `pageImages` to disk is what
exposed it: both pages came back byte-identical at 11,139 bytes, which is a blank
white PNG. The vision model was reading an empty page and truthfully reporting that
it found no questions.

**Root cause.** PDFs may reference the base-14 fonts (Helvetica, Times, Courier)
without embedding them, which is exactly what most exam-paper exporters do. The
call site passed `useSystemFonts: true`, which tells pdf.js to substitute a font
installed on the host machine. Windows has one; Vercel's function image ships
essentially none, so every glyph drew as nothing.

pdf.js's own default for `useSystemFonts` in Node is `false`, precisely to avoid
this — the option was overriding a deliberately safe default.

**Fix.** Point pdf.js at the standard fonts bundled inside `pdfjs-dist`
(Liberation, metric-compatible with Helvetica) via `standardFontDataUrl`, so
rendering no longer depends on the host at all. Those `.pfb`/`.ttf` files are read
with `fs.readFile` at runtime, so no import analysis can find them — they need
`outputFileTracingIncludes`, the same treatment as `pdf.worker.mjs`. The directory
is resolved lazily and then checked with `existsSync`, because `import.meta.url` is
a numeric module id during Turbopack's build-time page-data collection, and because
a plausible-but-wrong path would reintroduce the silent blank page.

**Verified on the deployed URL**, not locally: the live render went from 11,139
bytes (blank) to 42,036 / 40,985 bytes — byte-identical to the local render — and
from 0 questions to all 7.

**Side benefit.** The local render was quietly wrong too. System-font substitution
was producing visibly broken letter spacing; the bundled Liberation fonts have
correct Helvetica metrics.

**Lesson.** Local success proved nothing here. Two of the three bugs above
(`pdf.worker.mjs` missing from the trace, and this one) only existed in the
deployed environment, and both stemmed from the same underlying cause: files that
are read at runtime rather than imported are invisible to the bundler's file
tracer.

### 4. The selected tab was invisible — twice

**Symptom.** On the phone layout, tapping between "Questions" and "Answer Sheet"
changed the panel but gave no visual indication of which tab was selected.

**Root cause.** Not missing styling, which is what it looked like. shadcn's
`TabsTrigger` ships `data-active:bg-background` — white — and the list sits on
`--veda-white-50`. So the selected tab was a white pill on near-white: fully
styled, and invisible. Fixed with `Buttons/Primary-85` (`#303030`) and white
text, which is the Figma treatment.

**Then the fix had the same bug again.** Measuring the corrected version in a
browser returned `bg=rgb(48,48,48) color=rgb(48,48,48)` — dark text on the dark
pill. The base trigger also ships `hover:text-foreground`, which outranks a plain
`data-active:text-white`, so hovering the selected tab made its label vanish.
Needed `data-active:hover:text-white` as well.

**Why it hid.** Same class as bug 2: pure cascade, invisible to the type checker
and the build. It only appeared by reading `getComputedStyle` off a real render.
The second half also only appeared because the check happened to leave the
pointer resting on the element it had just clicked — a hover state that would
otherwise have shipped unnoticed.

Verified at rest and on hover, both tabs:

```
active, at rest    bg=rgb(48,48,48)  color=rgb(255,255,255)
active, hovered    bg=rgb(48,48,48)  color=rgb(255,255,255)
inactive           bg=transparent    color=foreground/60
```

### 5. A whole answer silently lost — three causes behind one symptom

**Symptom.** On a real 6-page handwritten Solidity script, Q8 came back as
`0/1  "No answer was found for this question on the answer sheet"` on run after
run — while page 6 plainly contains a block labelled `A 8)` with the correct
answer (a base `Animal` contract and a derived `Dog` overriding it). Q7 was also
flagged for review and scored low, which turned out not to be a coincidence.

Root-caused by dumping the real intermediate JSON at every stage rather than
guessing, which mattered: the first two stages were innocent, and the third
turned up two further defects that had nothing to do with Q8.

**Not the cause (checked first).** `pdf-to-images` rendered all 6 pages
(1783/1721/1694/1512/1574/1676 KB) and page 6 is fully legible. Extraction did
transcribe the answer — every marker (`A 8)`, `Admin`, `Animal`, `Dog`,
`override`, `Bark`) appeared in the output. Nothing was truncated or dropped.

#### Cause 1 — non-deterministic block segmentation

The vision model chooses block boundaries itself, and that choice is unstable.
The same PDF returned **11 to 21 blocks** across runs. When page 6 came back as
a *single* block, it held the tail of A7 followed by the whole of A8 — and
because that block *opens* with A7's `modifier onlyOwner` code, mapping
attributed it to Q7. Q8 was then left with no block at all:

```
p6-1 -> q7 in 5 of 6 successful mapping runs, unanswered=[8] each time
```

That is the whole symptom, including Q7's low score: Q7's matched content
contained an entire extra answer, diluting it.

*Fix, two parts.* `temperature: 0` on the Gemini call — transcription should not
be a sampled task. **On its own this did not work**: block counts across 10 runs
were still `20, 12, 18, 12, 15, 13, 14, 14, 18, 11`. It is kept because there is
no reason to sample here, but the real fix is `lib/answer-blocks.ts`, which does
not rely on model behaviour at all. The boundary is already written on the page —
students label their answers — so a line-leading label (`A 8)`, `A8)`, `Ans 7:`,
`Q3.`) found *mid-block* is treated as a seam and the block is split there.

It caught more than the reported bug: `p4-1` was A5+A6 merged and `p5-1` was
A6+A7 merged, both silently, on the same script.

| | before | after |
| --- | --- | --- |
| A8 isolated in its own block | merged on 2 of 3 deployed runs | **9/10** extraction runs |
| Q8 graded end to end | `0/1 "No answer found"` | **13/14** runs, scoring 3/3 to 5/5 |

Two details worth keeping. The bbox for a split fragment is an *estimate* —
the box is divided vertically in proportion to character offset, which assumes
text is evenly distributed, so a dense code listing under a short heading can be
off by a line or two. And a short (<=80 char) unlabelled run before a label is
folded forward rather than emitted separately, because it is a heading for the
answer below ("Inheritance.sol." above `A 8)`), not an answer of its own.

#### Cause 2 — mapping dropped blocks with no signal

Found while investigating the above, and worse than the original bug. On one
14-block response the model returned well-formed JSON that simply **omitted four
blocks** (`p3-2`, `p4-1`, `p5-1`, `p6-1`). They vanished: no error, no triage
entry, and the four questions they belonged to were reported unanswered. The
route already backfilled questions the model forgot; blocks had no equivalent.

*Fix.* `lib/mapping-repair.ts` enforces the other half of the same guarantee —
every block appears in exactly one mapping, anything unplaced is surfaced as
`unmatched`, and a block claimed twice is kept only by the first claimant.

Verified directly rather than by waiting for it to recur, because across 14 live
runs it never fired (`dropped=0` every time — with cause 1 fixed the model
stopped dropping blocks on this input). Replaying the real 4-block-drop
response: **9/9 assertions**, covering the observed drop, the duplicate-claim
case, and that an already-correct response is left untouched.

#### Cause 3 — `/api/map-answers` returning hard 500s

Groq's `response_format: json_object` validates the completion server-side and
returns HTTP 400 when the model emits invalid JSON. It reads like a client error
but nothing about the request is wrong — the identical body succeeds on retry.
It was reaching the user as a 500 because the retry only caught `LlmParseError`,
which covers unparseable text on a *2xx*; this failure never reaches the parser.
Measured **3 hard failures in 8 calls**, then 3 in 10.

Three distinct problems, each found by reading the log rather than assuming.

*First*, Groq emits **two wordings** for this — `Failed to validate JSON` and
`Failed to generate JSON` — and matching only the first left a third of the
failures unretried. The classifier now matches `json_(validate|generate)_failed`.

*Second*, retrying did not help, and the reason mattered more than the count.
A first attempt at this raised the retry budget to three and a request was then
observed **failing all three attempts on an identical prompt**. At the measured
per-attempt failure rate that should happen ~3.6% of the time, so seeing it
immediately pointed at correlated rather than independent failures: when a model
cannot emit valid JSON for a particular input, asking the same model the same
question again is not a retry. `activeModel` had pinned the chain to one entry
after its first success, so every "retry" went back to the model that had just
failed.

*Fix.* The retry now **changes model** instead of repeating itself:
`openai/gpt-oss-120b` -> `qwen/qwen3.8-27b` -> `openai/gpt-oss-20b`, one attempt
each, with `activeModel` demoted from a pin to a preference. The order changes
model *family* at the first hop on purpose — a second opinion from a different
lineage is worth more than a smaller sibling of the model that just failed. The
chain was checked against `GET /v1/models` on the live key rather than assumed:
all three exist, and `qwen/qwen3-32b` (an obvious-looking choice) does not. The
Groq client is also constructed with `maxRetries: 0`, since the SDK's default of
2 would have silently re-sent the identical request to the same model first —
precisely the behaviour that proved useless.

Changing model helps for a second reason: Groq's token budget is **per model**,
so a 429 on the largest model says nothing about whether a smaller one can serve
the request. Rate limits now fall through the chain too.

*Verified entirely with mocked tests* — `globalThis.fetch` is stubbed, so the
real SDK, the real error shapes it throws and the real classification code all
run, at zero quota cost. **26/26 assertions**, covering: fallthrough on the first
model's failure; two-deep fallthrough using both real error wordings; chain
exhaustion surfacing the error rather than inventing a result; 429 falling
through; a 401 failing *fast* without walking the chain; a malformed 200 body
falling through; `mapAnswers` still returning a well-formed `Mapping` after a
first-model failure; and `activeModel` being tried first without collapsing the
chain.

**The live failure rate after this change is not measured, and that was a
deliberate choice.** Establishing it would take dozens of real mapping calls
against a daily budget that this investigation had already exhausted once. The
tradeoff is defensible because this failure mode is categorically different from
the one above: a JSON-validation failure produces a **visible 500** — loud,
attributable, and harmless as long as it does not reach a user, which is what the
chain now handles. The Q8 bug produced **silent data loss**, a student's answer
marked "no answer found" with nothing on screen to suggest anything was wrong;
that had to be hunted down and fixed whatever it cost in quota, and was. The
exact residual percentage here remains an acknowledged unknown rather than a
number I could honestly quote.

## Design fidelity checks against Figma

Two details were carried on a screenshot reading rather than the file, and were
later checked against the frame itself (`GET /v1/files/.../nodes?ids=1:9959`,
plus a node image export). Both had been guessed wrong in one direction or
another:

- **The collapsed rail's AI mark.** Exporting the icon node returned a 19x18
  SVG, matching the twin-sparkle `AiSparkPairIcon` exactly and ruling out the
  single-spark `AiSparkIcon` (21x20).
- **That button's colour.** The frame gives `fills: ["#272727"]` — the one and
  only occurrence of `#272727` in the file — plus a 4px gradient stroke running
  `rgba(255,121,80)` to `rgba(192,53,10)`. So the fill was never orange, but the
  button does carry a prominent orange ring, and the implementation had the fill
  and no ring at all. The gradient is its own two-stop value, not the
  `--veda-orange` token, so it is kept literal.

The ring recipe is identical for the expanded pill and the collapsed button, so
it now lives in one shared `AI_PILL_STYLE` rather than being duplicated.

## What is not covered

- Real handwriting has now been through the pipeline exactly once: a 6-page
  handwritten Solidity assignment, which is what surfaced bug 5. One script is
  not a distribution — it says nothing about untidy handwriting, unlabelled
  answers, or a paper with no question numbers at all, and the synthetic
  fixtures remain the only source of deliberate edge cases.
- Confidence calibration is characterised for `openai/gpt-oss-120b` specifically.
  A different model would need the threshold re-measured.
- **Answers can still be lost, roughly 1 run in 10-14.** The split in cause 1
  needs a label in the text to cut on. When Gemini both merges two answers into
  one block *and* omits the `A 8)` label from its transcription, there is no
  signal left to detect the seam and the second answer is attributed to the wrong
  question — the original bug, at a much lower rate. Measured: A8 isolated in
  9/10 extraction runs, graded correctly in 13/14 end-to-end runs. I could not
  reproduce the failure in 6 further targeted attempts, so I cannot characterise
  it beyond that. A teacher would see it as one question wrongly marked
  "no answer found". Fixing it properly means not depending on the model for
  segmentation at all — layout-based splitting on the page image, or a
  reconciliation pass that re-checks unanswered questions against the full
  transcript.
- **The `/api/map-answers` failure rate after the model-varying retry is not
  measured.** The mechanism is verified by mocked tests (26/26) and the reasoning
  behind it is sound — the observed failure was correlated, so a different model
  is the remedy and repetition was not. But no number exists for how often all
  three models fail on the same input, and none is quoted. Measuring it would
  cost dozens of real mapping calls against a budget this work already exhausted
  once, and the failure is a visible 500 rather than silent data loss, so it was
  judged not worth the quota. If it matters later, the measurement is a day of
  free-tier budget away.
- **Groq's free tier was genuinely exhausted by this testing.** Not a theoretical
  limit: the daily cap is 200,000 tokens per model (`openai/gpt-oss-120b`), one
  mapping call on a 14-block script costs ~5,500 of them, and a day of repeated
  verification runs hit `TPD: Limit 200000, Used 198414`. It is a rolling window
  that frees a few thousand tokens every several minutes rather than resetting at
  once, so a clean test request needed ~4 minutes of waiting. Worth knowing for
  anyone reading the free-tier claim: it comfortably covers real use at ~4 calls
  a session, and does not cover sustained testing. Note also that the response
  headers expose only per-minute tokens and per-day *requests* — the per-day
  token budget is not among them, so a small probe call returns 200 and tells you
  nothing about whether a real call will fit.
- JPEG 2000 and JBIG2 codecs: `pdfjs-dist/wasm/` is not traced into the deployed
  functions. pdf.js falls back to its `*_nowasm_fallback.js` paths, and the tested
  scans decode correctly, but a PDF from a copier that uses those codecs has not
  been tried against the deployment.
- No automated test suite is committed. Verification was script-driven against a
  live pipeline; making it CI-ready would mean recording provider responses so the
  tests can run without keys.
