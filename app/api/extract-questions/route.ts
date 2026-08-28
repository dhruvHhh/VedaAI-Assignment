import { NextResponse } from "next/server";
import { fileToBase64Images, __fontDiagnostics } from "@/lib/pdf-to-images";
import { extractQuestions, getActiveVisionModel } from "@/lib/vision";
import { errorResponse } from "../_shared";

// Native canvas + pdfjs rasterisation require Node, not the edge runtime.
export const runtime = "nodejs";
/**
 * Measured: rendering is cheap (~208ms/page), Gemini inference dominates -
 * a 2-page photographed scan takes ~9s end to end, of which ~8.8s is the model.
 * At MAX_PAGES=20 that is ~4s render plus ~6.7MB uploaded for inference, which
 * comfortably exceeds 60s. Note Vercel Hobby caps maxDuration at 60 - lower
 * this to 60 if deploying there.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded under the 'file' field." },
        { status: 400 },
      );
    }

    const pageImages = await fileToBase64Images(file);
    const questions = await extractQuestions(pageImages);

    return NextResponse.json({
      questions,
      pageImages,
      model: getActiveVisionModel(),
      // TEMPORARY (remove after live verification)
      _debug: __fontDiagnostics(),
    });
  } catch (error) {
    return errorResponse("extract-questions", error);
  }
}
