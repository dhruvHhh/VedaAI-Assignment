import { createRequire } from "node:module";
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
    useSystemFonts: true,
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
