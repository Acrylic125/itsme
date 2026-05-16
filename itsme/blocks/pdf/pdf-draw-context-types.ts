import type { z } from "zod";
import type { TextStyleSchema } from "../text/schema";
import type { PdfStructureTag } from "./types";

export type PdfTextAlign = "left" | "center" | "right";

export type PdfDrawWrappedTextArgs = {
  xPx: number;
  yPx: number;
  widthPx: number;
  text: string;
  style: z.infer<typeof TextStyleSchema>;
  align: PdfTextAlign;
  tag?: Exclude<PdfStructureTag, "Document"> | null;
};

export interface PdfDrawSurface {
  setPageForY(yPx: number): void;
  beginMarkedGroup(
    tag: Exclude<PdfStructureTag, "Document">,
    yPx: number
  ): () => void;
  shouldApplyTextMark(): boolean;
  withSuppressedTextMark(run: () => void): void;
  drawWrappedText(args: PdfDrawWrappedTextArgs): void;
}
