import { NextResponse } from "next/server";
import { fileToBase64Images } from "@/lib/pdf-to-images";
import { extractAnswers, getActiveVisionModel } from "@/lib/vision";
import { errorResponse } from "../_shared";

// Native canvas + pdfjs rasterisation require Node, not the edge runtime.
export const runtime = "nodejs";
/**
 * Measured: rendering is cheap (~208ms/page), Gemini inference dominates -
 * a 2-page photographed scan takes ~9s end to end, of which ~8.8s is the model.
 * At MAX_PAGES=20 that is ~4s render plus ~6.7MB uploaded for inference, which
 * comfortably exceeds 60s.
 *
 * Do not lower this to 60. It is honoured in production via vercel.json with
 * fluid compute enabled, and a real 6-page handwritten scan measured 29s
 * locally and 42s against the deployment - close enough to 60 that capping it
 * there would start failing genuine uploads.
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
    const answerBlocks = await extractAnswers(pageImages);

    return NextResponse.json({
      answerBlocks,
      pageImages,
      model: getActiveVisionModel(),
    });
  } catch (error) {
    return errorResponse("extract-answers", error);
  }
}
