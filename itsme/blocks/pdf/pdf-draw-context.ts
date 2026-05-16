import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import type { JsPdfDocument } from "./marked-pdf";
import { MarkedPdf } from "./marked-pdf";
import type {
  PdfDrawSurface,
  PdfDrawWrappedTextArgs,
} from "./pdf-draw-context-types";

export type { PdfDrawSurface, PdfDrawWrappedTextArgs } from "./pdf-draw-context-types";

function mapFontFamily(fontFamily: string) {
  const normalized = fontFamily.trim().toLowerCase();
  if (normalized === "times new roman" || normalized === "times") {
    return "times";
  }
  if (normalized === "helvetica" || normalized === "arial") {
    return "helvetica";
  }
  if (normalized === "courier" || normalized === "courier new") {
    return "courier";
  }
  return "times";
}

function pxToInches(px: number, dpi: number) {
  return px / dpi;
}

export class PdfDrawContext implements PdfDrawSurface {
  private readonly markedPdf: MarkedPdf;
  private suppressTextMark = 0;

  constructor(
    private readonly doc: JsPdfDocument,
    private readonly dpi: number,
    private readonly pageHeightPx: number,
    private readonly pageStridePx: number,
    language?: string
  ) {
    this.markedPdf = new MarkedPdf(doc, language);
  }

  setPageForY(yPx: number) {
    const pageIndex = Math.max(0, Math.floor(yPx / this.pageStridePx));
    this.doc.setPage(pageIndex + 1);
  }

  beginMarkedGroup(
    tag: Exclude<PdfStructureTag, "Document">,
    yPx: number
  ) {
    this.setPageForY(yPx);
    return this.markedPdf.beginMarkedContent(tag);
  }

  shouldApplyTextMark() {
    return this.suppressTextMark === 0;
  }

  withSuppressedTextMark(run: () => void) {
    this.suppressTextMark += 1;
    try {
      run();
    } finally {
      this.suppressTextMark -= 1;
    }
  }

  drawWrappedText(args: PdfDrawWrappedTextArgs) {
    const { xPx, yPx, widthPx, text, style, align } = args;
    const tag =
      args.tag === undefined
        ? this.shouldApplyTextMark()
          ? "P"
          : null
        : args.tag;
    if (text.length === 0 || widthPx <= 0) {
      return;
    }

    const fontFamily = mapFontFamily(style.fontFamily);
    const fontStyle = style.fontWeight === "bold" ? "bold" : "normal";
    const fontSizePx = (style.fontSize * this.dpi) / 72;
    const lineAdvancePx = fontSizePx * style.lineHeight;
    const prepared = prepareWithSegments(
      text,
      `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`,
      { whiteSpace: "pre-wrap" }
    );
    const { lines } = layoutWithLines(prepared, widthPx, style.lineHeight);
    if (lines.length === 0) {
      return;
    }

    this.doc.setFont(fontFamily, fontStyle);
    this.doc.setFontSize(style.fontSize);

    const markedGroup = {
      close: null as (() => void) | null,
    };
    let markedPageIndex: number | null = null;

    const openMarkedContentForPage = (pageIndex: number) => {
      if (tag === null || markedPageIndex === pageIndex) {
        return;
      }
      markedGroup.close?.();
      this.doc.setPage(pageIndex + 1);
      markedGroup.close = this.markedPdf.beginMarkedContent(tag);
      markedPageIndex = pageIndex;
    };

    try {
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineYPx = yPx + index * lineAdvancePx;
        const pageIndex = Math.max(0, Math.floor(lineYPx / this.pageStridePx));
        const pageLocalYPx = lineYPx - pageIndex * this.pageStridePx;

        openMarkedContentForPage(pageIndex);
        this.doc.setPage(pageIndex + 1);

        const lineWidthInches = pxToInches(line.width, this.dpi);
        const frameXInches = pxToInches(xPx, this.dpi);
        const frameWidthInches = pxToInches(widthPx, this.dpi);
        let lineXInches = frameXInches;
        if (align === "center") {
          lineXInches = frameXInches + (frameWidthInches - lineWidthInches) / 2;
        } else if (align === "right") {
          lineXInches = frameXInches + frameWidthInches - lineWidthInches;
        }

        const lineYInches = pxToInches(
          Math.min(pageLocalYPx, this.pageHeightPx),
          this.dpi
        );
        this.doc.text(line.text, lineXInches, lineYInches, {
          baseline: "top",
        });
      }
    } finally {
      markedGroup.close?.();
    }
  }
}
