import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Keep these two out of the server bundle.
   *
   * `@napi-rs/canvas` is a native addon that cannot be bundled at all, and
   * `pdfjs-dist`
   * resolves its fake worker via a relative import at runtime — bundling it
   * rewrites that path and the worker fails to load with
   * "Setting up fake worker failed".
   */
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],

  /**
   * Force pdfjs's runtime assets into the traced output for the two routes
   * that rasterise PDFs.
   *
   * The worker: lib/pdf-to-images.ts imports it with a literal specifier so
   * the tracer should already find it, but pdfjs reaches the same file through
   * an untraceable dynamic import as well. This makes inclusion independent of
   * that analysis holding up across bundler versions.
   *
   * The standard fonts: these are data files opened with fs.readFile at
   * runtime, so no amount of import analysis would ever find them. Without
   * them, PDFs that reference the base-14 fonts without embedding them render
   * as blank pages on Vercel. ~800KB, only on these two routes.
   */
  outputFileTracingIncludes: {
    "/api/extract-questions": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
    "/api/extract-answers": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
};

export default nextConfig;
