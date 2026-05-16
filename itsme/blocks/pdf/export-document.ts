"use client";

import type { z } from "zod";
import {
  createContext,
  DocumentSchema,
  getPageLayoutMetrics,
  renderDocumentLayout,
} from "../renderer";
import { PdfDrawContext } from "./pdf-draw-context";
import type { JsPdfDocument } from "./marked-pdf";
import { drawLayoutTree } from "./draw-layout-tree";

function sanitizePdfFileName(name: string) {
  const normalized = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
  return normalized.length > 0 ? normalized : "document";
}

export async function downloadDocumentPdf(
  sourceDocument: z.infer<typeof DocumentSchema> | null | undefined,
  dpi: number
) {
  if (!sourceDocument) {
    throw new Error("Cannot export PDF without a document.");
  }

  const document = sourceDocument;
  const { jsPDF } = await import("jspdf");
  const { rendered } = renderDocumentLayout({
    document,
    dpi,
  });
  const pageMetrics = getPageLayoutMetrics(document, dpi);
  const maxBottomPx = rendered.reduce(
    (maxBottom, block) =>
      Math.max(maxBottom, block.estimatedDimensions.y + block.estimatedDimensions.height),
    0
  );
  const pageCount = Math.max(1, Math.ceil(maxBottomPx / pageMetrics.pageStridePx));
  const orientation =
    document.pageSize.width >= document.pageSize.height ? "landscape" : "portrait";
  const doc = new jsPDF({
    unit: "in",
    format: [document.pageSize.width, document.pageSize.height],
    orientation,
    compress: true,
  });

  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    doc.addPage([document.pageSize.width, document.pageSize.height], orientation);
  }

  doc.setDocumentProperties({
    title: document.name,
    subject: "ITSME document export",
    creator: "itsme",
  });
  if ("setLanguage" in doc && typeof doc.setLanguage === "function") {
    doc.setLanguage("en-US");
  }

  const pdf = new PdfDrawContext(
    doc as unknown as JsPdfDocument,
    dpi,
    pageMetrics.pageHeightPx,
    pageMetrics.pageStridePx,
    "en-US"
  );
  const renderContext = createContext(document, dpi);
  const blocksById = new Map(document.blocks.map((block) => [block.id, block]));

  for (const block of rendered) {
    drawLayoutTree({
      layout: block.layout,
      renderContext,
      pdf,
      blocksById,
    });
  }

  doc.save(`${sanitizePdfFileName(document.name)}.pdf`);
}
