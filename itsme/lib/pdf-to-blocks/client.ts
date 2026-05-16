import {
  CreateProjectFromPdfInput,
  CreateProjectFromPdfInputSchema,
  ExtendedPDFTextItemSchema,
  MAX_PDF_SIZE_BYTES,
  PDFEndMarkedContentSchema,
  PDF_MAGIC_HEADER,
  PDFTextItemSchema,
  PDFStartMarkedContentSchema,
} from "./schema";
import { z } from "zod";

type PdfTextWithFont = z.infer<typeof ExtendedPDFTextItemSchema>;
type PdfMarkedItem =
  | (PdfTextWithFont & { type: "text" })
  | z.infer<typeof PDFStartMarkedContentSchema>
  | z.infer<typeof PDFEndMarkedContentSchema>;
type MarkedTag = z.infer<typeof PDFEndMarkedContentSchema.shape.tag>;

const PageViewSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const MarkedTagSchema = PDFEndMarkedContentSchema.shape.tag;

let workerInitialized = false;
let pdfJsModulePromise: Promise<
  typeof import("pdfjs-dist/legacy/build/pdf.mjs")
> | null = null;

async function getPdfJsModule() {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing is only available in the browser.");
  }
  pdfJsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfJsModulePromise;
}

export async function ensurePdfWorkerLoaded() {
  if (workerInitialized) return;
  const { GlobalWorkerOptions } = await getPdfJsModule();
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  workerInitialized = true;
}

type PdfTextStyles = Record<string, { fontFamily?: string } | undefined>;

function resolveFontName(fontName: string, styles: PdfTextStyles): string {
  return styles[fontName]?.fontFamily ?? fontName;
}

function normalizeMarkedTag(rawTag: unknown): MarkedTag {
  let candidate: unknown = rawTag;
  if (
    typeof rawTag === "object" &&
    rawTag !== null &&
    "name" in rawTag &&
    typeof (rawTag as { name?: unknown }).name === "string"
  ) {
    candidate = (rawTag as { name: string }).name;
  }
  if (typeof candidate !== "string") return "SPAN";
  const normalized = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parsed = MarkedTagSchema.safeParse(normalized);
  return parsed.success ? parsed.data : "SPAN";
}

export async function parsePdf(file: File): Promise<CreateProjectFromPdfInput> {
  await ensurePdfWorkerLoaded();

  if (file.type !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error("PDF must be 256KB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
  if (header !== PDF_MAGIC_HEADER) {
    throw new Error("Invalid PDF file.");
  }

  const { getDocument } = await getPdfJsModule();
  const loadingTask = getDocument({
    data: bytes,
  } as never);
  const pdfDocument = await loadingTask.promise;
  const markInfo = await pdfDocument.getMarkInfo();
  const isMarked = Boolean(markInfo?.Marked);

  if (isMarked) {
    const pages: Extract<
      CreateProjectFromPdfInput,
      { type: "marked" }
    >["pages"] = [];
    for (
      let pageNumber = 1;
      pageNumber <= pdfDocument.numPages;
      pageNumber += 1
    ) {
      const page = await pdfDocument.getPage(pageNumber);
      const markedContent = await page.getTextContent({
        includeMarkedContent: true,
      });
      const styles = markedContent.styles as PdfTextStyles;
      const textItems: PdfMarkedItem[] = [];
      for (const rawItem of markedContent.items as unknown[]) {
        if (
          typeof rawItem === "object" &&
          rawItem !== null &&
          "str" in rawItem &&
          "fontName" in rawItem
        ) {
          const textItem = PDFTextItemSchema.parse(rawItem);
          textItems.push({
            ...textItem,
            font: resolveFontName(textItem.fontName, styles),
            type: "text",
          });
          continue;
        }
        if (
          typeof rawItem === "object" &&
          rawItem !== null &&
          "type" in rawItem &&
          (rawItem.type === "beginMarkedContentProps" ||
            rawItem.type === "beginMarkedContent")
        ) {
          textItems.push(
            PDFEndMarkedContentSchema.parse({
              type: "beginMarkedContentProps",
              tag: normalizeMarkedTag((rawItem as { tag?: unknown }).tag),
            })
          );
          continue;
        }
        if (
          typeof rawItem === "object" &&
          rawItem !== null &&
          "type" in rawItem &&
          rawItem.type === "endMarkedContent"
        ) {
          textItems.push({ type: "startMarkedContent" });
        }
      }

      pages.push({
        view: PageViewSchema.parse(page.view),
        textItems,
      });
    }
    return CreateProjectFromPdfInputSchema.parse({
      type: "marked",
      pages,
    });
  }

  const pages: Extract<
    CreateProjectFromPdfInput,
    { type: "unmarked" }
  >["pages"] = [];
  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber += 1
  ) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const styles = textContent.styles as PdfTextStyles;
    const items = PDFTextItemSchema.array().parse(textContent.items);
    const textItems = items.map((item) => ({
      ...item,
      font: resolveFontName(item.fontName, styles),
    }));
    pages.push({
      view: PageViewSchema.parse(page.view),
      textItems,
    });
  }

  return CreateProjectFromPdfInputSchema.parse({
    type: "unmarked",
    pages,
  });
}
