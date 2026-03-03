"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Text, Group } from "react-konva";
import jsPDF from "jspdf";
import {
  DocumentDefinition,
  layoutDocument,
  resolveDocument,
} from "./document-blocks";

export { SAMPLE_RESUME } from "./document-blocks";

const PAGE_GAP = 24;

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: DocumentDefinition;
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(
        el.clientWidth || el.getBoundingClientRect().width || 0
      );
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const resolvedDocument = useMemo(() => resolveDocument(document), [document]);
  const pages = useMemo(
    () => layoutDocument(resolvedDocument),
    [resolvedDocument]
  );

  const pageWidth = resolvedDocument.pageSize.width;
  const pageHeight = resolvedDocument.pageSize.height;

  const scale =
    containerWidth != null && containerWidth > 0
      ? containerWidth / pageWidth
      : 1;

  const stageWidth = containerWidth ?? pageWidth;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  const handleExportPdf = () => {
    if (pages.length === 0) return;

    const orientation = pageWidth >= pageHeight ? "l" : "p";
    const pdf = new jsPDF({
      orientation,
      unit: "px",
      format: [pageWidth, pageHeight],
    });

    pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      page.items.forEach((item) => {
        // Match Konva's horizontal alignment box.
        let xPx = item.x;
        if (item.align === "center") {
          xPx = item.x + item.width / 2;
        } else if (item.align === "right") {
          xPx = item.x + item.width;
        }

        const fontSizePt = item.fontSize / 0.75; // px -> jsPDF points (per Konva example)
        const yPx = item.y; // Konva uses y as top; we use baseline: 'top' below.
        const maxWidthPx = item.width;

        const fontFamily =
          resolvedDocument.font === "Times New Roman" ? "times" : "helvetica";
        const fontStyle = item.fontWeight === "bold" ? "bold" : "normal";

        pdf.setFont(
          fontFamily as "times" | "helvetica",
          fontStyle as "normal" | "bold"
        );
        pdf.setFontSize(fontSizePt);

        pdf.text(item.text, xPx, yPx, {
          maxWidth: maxWidthPx,
          baseline: "top",
          align: item.align ?? "left",
        });
      });
    });

    const fileName = document?.name || "document";
    pdf.save(`${fileName}.pdf`);
  };

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <button
        type="button"
        onClick={handleExportPdf}
        style={{ marginBottom: 8 }}
      >
        Export as PDF
      </button>
      {containerWidth !== null && (
        <Stage
          width={stageWidth}
          height={stageHeight}
          pixelRatio={dpi / 96}
          listening={false}
        >
          <Layer listening={false}>
            {pages.map((page, pageIndex) => {
              const yOffset = pageIndex * (pageHeight + PAGE_GAP) * scale;

              return (
                <Group
                  key={pageIndex}
                  y={yOffset}
                  scaleX={scale}
                  scaleY={scale}
                  listening={false}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={pageWidth}
                    height={pageHeight}
                    stroke="#e5e5e5"
                    fill="#ffffff"
                    cornerRadius={2}
                    perfectDrawEnabled={false}
                  />
                  {page.items.map((item, idx) => (
                    <Text
                      key={idx}
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      text={item.text}
                      fontFamily={resolvedDocument.font}
                      fontSize={item.fontSize}
                      lineHeight={item.lineHeight}
                      fontStyle={item.fontWeight === "bold" ? "bold" : "normal"}
                      align={item.align}
                      fill="#000000"
                      perfectDrawEnabled={false}
                    />
                  ))}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
