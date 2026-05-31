import { Router, type IRouter } from "express";
import multer from "multer";
import { sessionMiddleware, isPremiumActive, LIMITS } from "../lib/session";
import { updateUser } from "../lib/db-users";
import { visionAnalyze } from "../lib/ai";
import { isFlagEnabled } from "../lib/flags";
import { pushError } from "../lib/error-log";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const MAINTENANCE = "This feature is temporarily unavailable for maintenance.";

router.post("/upload", sessionMiddleware, upload.single("file"), async (req, res, next) => {
  try {
    const u = req.user!;
    const premium = isPremiumActive(u);
    const messageLimit = LIMITS.messages.free + LIMITS.messages.grace;
    if (!premium && u.messagesUsedToday >= messageLimit) {
      res.status(402).json({
        error: "Daily message limit reached. Upgrade to Premium for unlimited access.",
        code: "LIMIT_REACHED",
        kind: "messages",
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded", code: "NO_FILE" });
      return;
    }

    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";

    if (!isImage && !isPdf) {
      res.status(400).json({
        error: "Only image files (JPG, PNG, WEBP) or PDF files are supported.",
        code: "BAD_TYPE",
      });
      return;
    }

    if (isImage && !isFlagEnabled("image_upload")) {
      res.status(503).json({ error: MAINTENANCE, code: "FEATURE_DISABLED" });
      return;
    }
    if (isPdf && !isFlagEnabled("pdf_upload")) {
      res.status(503).json({ error: MAINTENANCE, code: "FEATURE_DISABLED" });
      return;
    }

    const maxSize = isImage ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      res.status(400).json({
        error: isImage ? "Images must be 5MB or less" : "PDFs must be 10MB or less",
        code: "FILE_TOO_LARGE",
      });
      return;
    }

    let summary: string;
    let contextNote: string;
    let kind: "image" | "pdf";

    if (isImage) {
      kind = "image";

      const analysisPrompt =
        typeof req.body?.prompt === "string" && req.body.prompt.trim().length > 0
          ? req.body.prompt.trim()
          : "Analyze this image in full detail for a student. First, extract ALL visible text character by character (OCR). Then describe all diagrams, charts, tables, equations, figures, and any other elements. Identify the subject matter and how it relates to academic study. Be as thorough as possible — include every piece of information visible.";

      const rawAnalysis = await visionAnalyze({
        imageBase64: file.buffer.toString("base64"),
        mimeType: file.mimetype,
        prompt: analysisPrompt,
      });

      if (!rawAnalysis || rawAnalysis.startsWith("⚠️")) {
        pushError({ ts: new Date().toISOString(), provider: "vision", stage: "image_upload", message: "Vision analysis returned empty or error" });
        res.status(502).json({
          error: "Unable to analyze image. Please try a clearer image.",
          code: "VISION_FAILED",
        });
        return;
      }

      contextNote = rawAnalysis;
      summary = rawAnalysis;

    } else {
      kind = "pdf";
      let extractedText = "";
      try {
        if (typeof (globalThis as any).DOMMatrix === "undefined") {
          (globalThis as any).DOMMatrix = class {};
        }
        const pdfModule = await import("pdf-parse");
        const pdfParse = (pdfModule as any).default ?? pdfModule;
        const data = await pdfParse(file.buffer);
        extractedText = (data.text ?? "").trim();
      } catch (err) {
        pushError({ ts: new Date().toISOString(), provider: "pdf-parse", stage: "pdf_upload", message: err instanceof Error ? err.message : String(err) });
        res.status(422).json({
          error: "Unable to read this PDF. The file may be corrupted or password-protected. Please try a different file.",
          code: "PDF_UNREADABLE",
        });
        return;
      }

      if (!extractedText || extractedText.length < 20) {
        try {
          const ocrResult = await visionAnalyze({
            imageBase64: file.buffer.toString("base64"),
            mimeType: "image/jpeg",
            prompt: "This is a scanned PDF document. Extract ALL text content from every page as accurately as possible. Output only the extracted text, preserving structure. Do not add commentary or analysis.",
          });
          if (ocrResult && !ocrResult.startsWith("⚠️") && ocrResult.length > 20) {
            extractedText = ocrResult;
          } else {
            res.status(422).json({
              error: "This PDF is image-based and text could not be extracted automatically. For best results, try a text-based PDF or take a photo of the page and use image upload instead.",
              code: "PDF_UNREADABLE",
            });
            return;
          }
        } catch {
          res.status(422).json({
            error: "This PDF is image-based and text could not be extracted automatically. For best results, try a text-based PDF or take a photo of the page and use image upload instead.",
            code: "PDF_UNREADABLE",
          });
          return;
        }
      }

      const MAX_CONTEXT_CHARS = 6000;
      contextNote = extractedText.length > MAX_CONTEXT_CHARS
        ? extractedText.slice(0, MAX_CONTEXT_CHARS) + "\n\n[Document continues — showing first portion]"
        : extractedText;

      const sizeLabel = extractedText.length > 1000
        ? `${Math.round(extractedText.length / 1000)}k chars`
        : `${extractedText.length} chars`;
      summary = `📄 **${file.originalname}** loaded (${sizeLabel} extracted). Ask me anything about this document.`;
    }

    await updateUser(u.id, { messagesUsedToday: u.messagesUsedToday + 1 });

    res.json({
      filename: file.originalname,
      kind,
      excerpt: `(${file.originalname})`,
      summary,
      contextNote,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
