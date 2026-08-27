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
};

export default nextConfig;
