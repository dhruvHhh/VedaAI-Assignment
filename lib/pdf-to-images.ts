import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";

/**
 * Renders an uploaded file into page images for the vision model.
 *
 * PDFs are rasterised page by page at 2x scale (handwriting loses too much
 * detail at 1x). Images pass through untouched.
 *
 * Returns data URLs — self-describing, usable directly as an <img> src on the
 * mapping screen, and trivially split back into raw base64 for Gemini's
 * inlineData. Always returns an array, even for a single image.
 *
 * Canvas backend: @napi-rs/canvas, NOT node-canvas. pdfjs v6 composites
 * embedded image XObjects (i.e. every scanned page) through its own scratch
 * canvases, and its built-in NodeCanvasFactory is written against
 * @napi-rs/canvas. Mixing node-canvas in makes pdfjs hand a foreign object to
 * ctx.drawImage, which fails with "Image or Canvas expected" — but only on
 * PDFs that actually contain a raster image, so vector/text-only PDFs render
 * fine and hide the bug.
 *
 * Node-only: depends on a native binding, so every route that calls this must
 * set `runtime = "nodejs"`.
 */

/** Higher = better OCR fidelity, larger payloads. 2x is the sweet spot. */
const RENDER_SCALE = 2;

/** Guard against a pathological upload blowing the request budget. */
const MAX_PAGES = 20;

/**
 * Absolute path to pdfjs's bundled standard fonts, with the trailing slash
 * pdfjs requires.
 *
 * Resolved from the installed package rather than hardcoded, so it survives
 * hoisting and pnpm-style layouts. The .pfb/.ttf files are read with
 * fs.readFile at runtime, so nothing imports them — they reach the deployment
 * via outputFileTracingIncludes in next.config.ts.
 *
 * Two candidates, checked against the filesystem rather than trusted:
 *
 *  - createRequire(import.meta.url) is the correct answer when this module is
 *    a real file on disk. Inside a bundled server chunk `import.meta.url` is
 *    not necessarily a file URL at all (during Turbopack's build-time page
 *    data collection it is a numeric module id, which is why this is lazy and
 *    not a module-level const), so it can throw or resolve somewhere useless.
 *  - process.cwd() is the deployment root on Vercel and the project root under
 *    next dev/start, and node_modules sits directly beneath it in both.
 *
 * Verifying with existsSync is what makes this safe: picking a plausible but
 * wrong directory would fail one glyph at a time and rasterise blank pages,
 * which is the exact failure this code exists to prevent.
 */
let standardFontDir: string | undefined;

function getStandardFontDir(): string | undefined {
  if (standardFontDir !== undefined) return standardFontDir || undefined;

  const candidates: string[] = [];
  try {
    candidates.push(
      dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")),
    );
  } catch {
    // Not resolvable from here; the cwd candidate below still applies.
  }
  candidates.push(join(process.cwd(), "node_modules", "pdfjs-dist"));

  standardFontDir = "";
  for (const base of candidates) {
    const dir = join(base, "standard_fonts");
    // LiberationSans-Regular.ttf is the Helvetica stand-in, i.e. the file that
    // actually matters for the common case.
    if (existsSync(join(dir, "LiberationSans-Regular.ttf"))) {
      standardFontDir = dir + "/";
      break;
    }
  }

  if (!standardFontDir) {
    // Loud, because the symptom is otherwise a silent success: pages render
    // blank and the vision model truthfully reports finding nothing.
    console.error(
      "[pdf-to-images] pdfjs standard fonts not found; PDFs that do not embed " +
        "their fonts will render blank. Looked in:",
      candidates.map((c) => join(c, "standard_fonts")),
    );
  }

  return standardFontDir || undefined;
}

/**
 * Canvas factory handed to getDocument() as `CanvasFactory` (capital C in v6).
 *
 * pdfjs would otherwise resolve its own factory via
 * `createRequire(import.meta.url)("@napi-rs/canvas")` at render time. Passing
 * ours makes the dependency explicit and bundler-proof, and guarantees the
 * scratch canvases are the same implementation as the page canvas we supply.
 *
 * Shape mirrors pdfjs's BaseCanvasFactory (create / reset / destroy), which is
 * not exported, so it is duck-typed here.
 */
class NapiCanvasFactory {
  // pdfjs constructs this as `new CanvasFactory({ enableHWA })`. Skia has no
  // software-readback hint to toggle, so the default constructor accepts and
  // ignores that argument rather than silently changing behaviour.

  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    canvasAndContext: { canvas: Canvas | null },
    width: number,
    height: number,
  ) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: {
    canvas: Canvas | null;
    context: SKRSContext2D | null;
  }) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// TEMPORARY (remove after live verification): lets the route report where the
// standard fonts resolved to, since Vercel function logs are not accessible
// from here.
export function __fontDiagnostics() {
  return { standardFontDir: getStandardFontDir() ?? null, cwd: process.cwd() };
}

export function isPdf(file: { type?: string; name?: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");
}

/** Splits a data URL into the parts Gemini's inlineData wants. */
export function dataUrlToInlineData(dataUrl: string): {
  mimeType: string;
  data: string;
} {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (match) return { mimeType: match[1], data: match[2] };
  // Already bare base64 — assume PNG.
  return { mimeType: "image/png", data: dataUrl };
}

export async function fileToBase64Images(file: File): Promise<string[]> {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!isPdf(file)) {
    const mimeType = file.type || "image/png";
    return [`data:${mimeType};base64,${buffer.toString("base64")}`];
  }

  // pdfjs-dist v6 ships ESM only; the legacy build is the Node-safe entry.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Load the worker module ourselves, with a literal specifier.
  //
  // In Node, pdfjs disables real Workers and falls back to fetching its worker
  // code with `await import(/*webpackIgnore: true*/ GlobalWorkerOptions.workerSrc)`,
  // where workerSrc defaults to the relative "./pdf.worker.mjs". That specifier
  // is a variable AND flagged webpackIgnore, so neither the bundler nor Vercel's
  // file tracer can see it: pdf.worker.mjs is never copied into the deployed
  // function and the route dies with "Setting up fake worker failed". Locally it
  // works, because dev serves the complete node_modules.
  //
  // A literal specifier is traceable. The module also assigns
  // globalThis.pdfjsWorker as a side effect, which pdfjs checks before falling
  // back, so the untraceable dynamic import is never reached.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  // Belt and braces: point workerSrc at the resolved file anyway. require.resolve
  // with a literal string is a second reference the tracer understands, and a
  // file:// URL is what dynamic import needs if it ever does run.
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      createRequire(import.meta.url).resolve(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
      ),
    ).href;
  } catch {
    // Resolution can fail in exotic bundling setups; the import above has
    // already registered the handler, so this is not fatal.
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Where to find glyphs for the base-14 fonts (Helvetica, Times, Courier...)
    // that PDFs are allowed to reference without embedding. Word and most
    // exam-paper exporters do exactly that, so this is the common case, not an
    // exotic one.
    //
    // We previously passed `useSystemFonts: true` instead, which tells pdfjs to
    // substitute a font installed on the machine. That silently depends on the
    // host: locally Windows supplies something Helvetica-ish, but Vercel's
    // function image ships essentially no fonts, so every glyph drew as nothing
    // and text PDFs rasterised to a blank white page. Gemini then dutifully
    // reported zero questions — a success response with empty results, which is
    // far worse than a crash. pdfjs's own Node default for useSystemFonts is
    // false for this reason; we were overriding the safe default.
    //
    // The bundled standard fonts (Liberation, metric-compatible with Helvetica)
    // are part of pdfjs-dist, so this renders identically everywhere.
    // In Node, pdfjs reads this with fs.readFile, so it wants a plain directory
    // path with a trailing slash — NOT a file:// URL.
    standardFontDataUrl: getStandardFontDir(),
    // v6 spells this with a capital C and takes the class, not an instance.
    CanvasFactory: NapiCanvasFactory,
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  const images: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const context = canvas.getContext("2d");

    // Scans are transparent-backed once rasterised; flatten to white so the
    // model sees paper rather than black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      // pdfjs's types expect the browser DOM equivalents.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;

    images.push(canvas.toDataURL("image/png"));
    page.cleanup();
  }

  // In pdfjs v6 it is the loading task that owns teardown, not the document.
  await loadingTask.destroy();
  return images;
}
