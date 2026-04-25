"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Layer,
  Rect,
  Group,
  Circle,
  Stage,
  Image as KonvaImage,
} from "react-konva";
import Konva from "konva";
import { DomPopupProvider } from "./dom-popup";
import {
  DocumentSchema,
  getPageLayoutMetrics,
  renderDocumentLayout,
  type RenderedLayoutBlock,
} from "@/blocks/renderer";
import { z } from "zod";
import {
  DocumentStoresProvider,
  useDocumentStores,
  useDocumentStore,
} from "@/blocks/document-context";
import { createMoveBlockUpdateFromDropZone } from "@/blocks/apply-block-move";
import { BlockDragProvider, useBlockDragContext } from "./block-dnd-context";
import { BlockFocusProvider } from "./block-focus-context";

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: z.infer<typeof DocumentSchema> & { id: string };
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measurements, setMeasurements] = useState<{
    containerWidth: number | null;
    dpr: number;
  }>({
    containerWidth: null,
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  });

  // Keep width + DPR updates in one effect to avoid stale pixel ratios and
  // ensure we react when flex/grid layout changes container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setMeasurements({
        containerWidth: el.clientWidth || el.getBoundingClientRect().width || 0,
        dpr: window.devicePixelRatio || 1,
      });
    };

    update();
    const rafId = window.requestAnimationFrame(update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  const { containerWidth, dpr } = measurements;

  return (
    <div ref={containerRef} className="w-full bg-black">
      {containerWidth !== null && (
        <DocumentStoresProvider document={document}>
          <PageCanvasKonva
            containerWidth={containerWidth}
            dpi={dpi}
            dpr={dpr}
          />
        </DocumentStoresProvider>
      )}
    </div>
  );
}

function PageCanvasKonva({
  containerWidth,
  dpi,
  dpr,
}: {
  containerWidth: number;
  dpi: number;
  dpr: number;
}) {
  const document = useDocumentStore((s) => s.document);
  const canMeasureText =
    typeof window !== "undefined" &&
    (typeof OffscreenCanvas !== "undefined" ||
      (!!window.document &&
        !!window.document.createElement("canvas").getContext("2d")));
  const blocks = useMemo(() => {
    return canMeasureText ? renderDocumentLayout({ document, dpi }) : [];
  }, [document, dpi, canMeasureText]);

  const { pageWidthPx, pageHeightPx, gapPx, pageStridePx } = useMemo(
    () => getPageLayoutMetrics(document, dpi),
    [document, dpi]
  );
  const pageWidth = pageWidthPx;
  const pageHeight = pageHeightPx;

  const scale = containerWidth > 0 ? containerWidth / pageWidth : 1;

  return (
    <DomPopupProvider>
      <BlockFocusProvider blocks={document.blocks} layout={document.layout}>
        <BlockDragProvider scale={scale} dpi={dpi}>
          <DocumentStage
            blocks={blocks}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            pageStridePx={pageStridePx}
            gapPx={gapPx}
            scale={scale}
            dpi={dpi}
            dpr={dpr}
          />
        </BlockDragProvider>
      </BlockFocusProvider>
    </DomPopupProvider>
  );
}

type DocumentStageProps = {
  blocks: RenderedLayoutBlock[];
  pageWidth: number;
  pageHeight: number;
  /** Layout stride in px: page height plus inter-page gap (matches renderer `createContext`). */
  pageStridePx: number;
  gapPx: number;
  scale: number;
  dpi: number;
  dpr: number;
};

function DocumentStage(props: DocumentStageProps) {
  const {
    blocks,
    pageWidth,
    pageHeight,
    pageStridePx,
    gapPx,
    scale,
    dpi,
    dpr,
  } = props;

  const dragCtx = useBlockDragContext()!;
  const { dragState, dropZones, moveDrag, endDrag } = dragCtx;
  const { updateQueueStore } = useDocumentStores();
  const documentId = useDocumentStore((s) => s.documentId);
  const document = useDocumentStore((s) => s.document);
  const updateDocument = useDocumentStore((s) => s.update);
  const stageRef = useRef<Konva.Stage | null>(null);
  const activeDropZone =
    dragState?.activeDropZoneId != null
      ? dropZones.find((d) => d.id === dragState.activeDropZoneId)
      : undefined;

  // Load the ghost image whenever a new drag starts with a captured data URL.
  // State is only set inside the async onload callback to satisfy lint rules.
  // Stale images are harmless because dragState being null prevents the ghost
  // from rendering regardless of what ghostImage holds.
  const [ghostImage, setGhostImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const src = dragState?.ghostImageSrc;
    if (!src) return;

    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setGhostImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [dragState?.ghostImageSrc]);

  // Use window-level mouse events during drag so movement / release outside
  // the canvas is still tracked.
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: MouseEvent) => {
      const container = stageRef.current?.container();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const stageX = e.clientX - rect.left;
      const stageY = e.clientY - rect.top;
      moveDrag(stageX / scale, stageY / scale);
    };

    const handleUp = () => {
      if (dragState && activeDropZone) {
        const moveUpdate = createMoveBlockUpdateFromDropZone({
          document,
          documentId,
          blockId: dragState.draggingBlockId,
          dropZone: activeDropZone,
        });
        if (moveUpdate) {
          updateDocument(updateQueueStore, moveUpdate);
        }
      }
      endDrag();
      const container = stageRef.current?.container();
      if (container) container.style.cursor = "default";
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    activeDropZone,
    document,
    documentId,
    dragState,
    endDrag,
    moveDrag,
    scale,
    updateDocument,
    updateQueueStore,
  ]);

  const maxEndY = blocks.reduce((m, b) => Math.max(m, b.y + b.height), 0);
  const pageCount = Math.max(1, Math.ceil(maxEndY / pageStridePx));
  const stageWidth = pageWidth * scale;
  const stageHeight =
    (pageCount * pageHeight + Math.max(0, pageCount - 1) * gapPx) * scale;

  const requestedPixelRatio = (dpi / 96) * dpr;
  // Very large backing stores can exceed browser canvas limits.
  // Cap pixel ratio for interactive editing stability.
  const pixelRatio = Math.min(requestedPixelRatio, 2);

  // Sizes expressed in doc canvas coordinates (divided by scale at render time).
  const placeholderCornerRadius = 3 / scale;
  const placeholderStrokeWidth = 1.5 / scale;

  // Ghost styling in doc canvas coords.
  const ghostStrokeWidth = 2 / scale;
  const ghostCornerRadius = 3 / scale;

  // Active insertion indicator only (blue line — no inactive “gray” zones).
  const activeLineThickness = 3 / scale;
  const dotRadius = 4 / scale;
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Prevent default to avoid text selection during drag interactions.
      e.evt.preventDefault();
    },
    []
  );

  return (
    <Stage
      ref={(n) => {
        stageRef.current = n;
      }}
      key={`${dpi}:${dpr}:${scale}`}
      width={stageWidth}
      height={stageHeight}
      pixelRatio={pixelRatio}
      onMouseDown={handleMouseDown}
    >
      {/* ── Content layer ─────────────────────────────────────────────── */}
      <Layer>
        {/* Stage background */}
        <Rect
          x={0}
          y={0}
          width={stageWidth}
          height={stageHeight}
          fill="#000000"
          perfectDrawEnabled={false}
          listening={false}
        />

        {/* Page rectangles */}
        {Array.from({ length: pageCount }, (_, pageIndex) => {
          const yOffset = pageIndex * pageStridePx * scale;
          return (
            <Group key={pageIndex} y={yOffset} scaleX={scale} scaleY={scale}>
              <Rect
                x={0}
                y={0}
                width={pageWidth}
                height={pageHeight}
                stroke="#e5e5e5"
                fill="#ffffff"
                cornerRadius={2}
                perfectDrawEnabled={false}
                listening={false}
              />
            </Group>
          );
        })}

        {/* Blocks + overlays (all in doc canvas coords via the scale group) */}
        <Group scaleX={scale} scaleY={scale}>
          {/* Gray placeholder at the dragged block's original position */}
          {dragState && (
            <Rect
              x={dragState.originalBounds.x}
              y={dragState.originalBounds.y}
              width={dragState.originalBounds.width}
              height={dragState.originalBounds.height}
              fill="#f1f5f9"
              stroke="#cbd5e1"
              strokeWidth={placeholderStrokeWidth}
              cornerRadius={placeholderCornerRadius}
              dash={[6 / scale, 4 / scale]}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {/* All rendered blocks (dragged block is hidden via opacity:0 in ReorderRegion) */}
          {blocks.map((block) => (
            <Group key={block.id}>{block.component()}</Group>
          ))}

          {/* Blue insertion line for the current drop target (drawn on top) */}
          {dragState && activeDropZone && (
            <Group listening={false}>
              {activeDropZone.type === "column-insert" ? (
                <>
                  <Rect
                    x={activeDropZone.lineX! - activeLineThickness / 2}
                    y={activeDropZone.bounds.y}
                    width={activeLineThickness}
                    height={activeDropZone.bounds.height}
                    fill="#3b82f6"
                    cornerRadius={activeLineThickness / 2}
                    shadowColor="#3b82f6"
                    shadowBlur={6 / scale}
                    shadowOpacity={0.5}
                    perfectDrawEnabled={false}
                  />
                  <Circle
                    x={activeDropZone.lineX!}
                    y={activeDropZone.bounds.y}
                    radius={dotRadius}
                    fill="#3b82f6"
                    perfectDrawEnabled={false}
                  />
                  <Circle
                    x={activeDropZone.lineX!}
                    y={activeDropZone.bounds.y + activeDropZone.bounds.height}
                    radius={dotRadius}
                    fill="#3b82f6"
                    perfectDrawEnabled={false}
                  />
                </>
              ) : (
                <>
                  <Rect
                    x={activeDropZone.bounds.x}
                    y={activeDropZone.lineY! - activeLineThickness / 2}
                    width={activeDropZone.bounds.width}
                    height={activeLineThickness}
                    fill="#3b82f6"
                    cornerRadius={activeLineThickness / 2}
                    shadowColor="#3b82f6"
                    shadowBlur={6 / scale}
                    shadowOpacity={0.5}
                    perfectDrawEnabled={false}
                  />
                  <Circle
                    x={activeDropZone.bounds.x}
                    y={activeDropZone.lineY!}
                    radius={dotRadius}
                    fill="#3b82f6"
                    perfectDrawEnabled={false}
                  />
                  <Circle
                    x={activeDropZone.bounds.x + activeDropZone.bounds.width}
                    y={activeDropZone.lineY!}
                    radius={dotRadius}
                    fill="#3b82f6"
                    perfectDrawEnabled={false}
                  />
                </>
              )}
            </Group>
          )}
        </Group>
      </Layer>

      {/* ── Drag ghost layer (always on top, no hit testing) ──────────── */}
      <Layer listening={false}>
        <Group scaleX={scale} scaleY={scale}>
          {dragState && (
            <Group
              x={dragState.ghostX}
              y={dragState.ghostY}
              opacity={0.5}
              shadowColor="#000000"
              shadowBlur={16 / scale}
              shadowOpacity={0.18}
              shadowOffsetY={5 / scale}
            >
              {ghostImage ? (
                <KonvaImage
                  image={ghostImage}
                  x={0}
                  y={0}
                  width={dragState.originalBounds.width}
                  height={dragState.originalBounds.height}
                />
              ) : (
                /* Fallback while image loads or if capture failed */
                <Rect
                  x={0}
                  y={0}
                  width={dragState.originalBounds.width}
                  height={dragState.originalBounds.height}
                  fill="#f8fafc"
                  stroke="#94a3b8"
                  strokeWidth={ghostStrokeWidth}
                  cornerRadius={ghostCornerRadius}
                  perfectDrawEnabled={false}
                />
              )}
            </Group>
          )}
        </Group>
      </Layer>
    </Stage>
  );
}
