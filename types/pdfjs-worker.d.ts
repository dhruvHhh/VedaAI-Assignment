/**
 * pdfjs-dist ships types for pdf.mjs but not for its worker bundle, which we
 * import purely for its side effect (it registers globalThis.pdfjsWorker so
 * pdfjs skips an untraceable dynamic import — see lib/pdf-to-images.ts).
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
