import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
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

export function ensurePdfWorkerLoaded() {
  if (workerInitialized) return;
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  workerInitialized = true;
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
  ensurePdfWorkerLoaded();

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

  const loadingTask = getDocument({
    data: bytes,
  } as unknown as Parameters<typeof getDocument>[0]);
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
      await page.getOperatorList();
      const markedContent = await page.getTextContent({
        includeMarkedContent: true,
      });
      const textItems: PdfMarkedItem[] = [];
      for (const rawItem of markedContent.items as unknown[]) {
        if (
          typeof rawItem === "object" &&
          rawItem !== null &&
          "str" in rawItem &&
          "fontName" in rawItem
        ) {
          const textItem = PDFTextItemSchema.parse(rawItem);
          const fontObj = page.commonObjs.get(textItem.fontName) as
            | { name?: string }
            | undefined;
          textItems.push({
            ...textItem,
            font: fontObj?.name ?? textItem.fontName,
            type: "text",
          });
          continue;
        }
        if (
          typeof rawItem === "object" &&
          rawItem !== null &&
          "type" in rawItem &&
          rawItem.type === "beginMarkedContentProps"
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
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = PDFTextItemSchema.array().parse(textContent.items);
    const textItems = items.map((item) => {
      const fontObj = page.commonObjs.get(item.fontName) as
        | { name?: string }
        | undefined;
      return {
        ...item,
        font: fontObj?.name ?? item.fontName,
      };
    });
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

