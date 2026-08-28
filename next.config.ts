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
   * Force pdfjs's worker into the traced output for the two routes that
   * rasterise PDFs.
   *
   * lib/pdf-to-images.ts imports it with a literal specifier so the tracer
   * should already find it, but pdfjs reaches the same file through an
   * untraceable dynamic import as well. This makes inclusion independent of
   * that analysis holding up across bundler versions.
   */
  outputFileTracingIncludes: {
    "/api/extract-questions": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/extract-answers": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
