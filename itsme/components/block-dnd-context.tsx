"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type BlockBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DropZoneType = "before" | "after" | "column-insert";

export type DropZone = {
  id: string;
  targetBlockId: string;
  type: DropZoneType;
  /** Hit area in doc canvas coordinates. */
  bounds: BlockBounds;
  /** Y position of the horizontal indicator line (before / after zones). */
  lineY?: number;
  /** X position of the vertical indicator line (column-insert zones). */
  lineX?: number;
};

export type DragState = {
  draggingBlockId: string;
  originalBounds: BlockBounds;
  /** Cursor offset from the block's top-left corner (doc canvas coords). */
  offsetX: number;
  offsetY: number;
  /** Top-left of the floating ghost (doc canvas coords). */
  ghostX: number;
  ghostY: number;
  activeDropZoneId: string | null;
  /** Data URL snapshot of the block's content, captured at drag start. */
  ghostImageSrc: string | null;
};

/** Metadata registered for each columns block. */
export type ColumnBlockEntry = {
  bounds: BlockBounds;
  /** Sum of all column spans already in this block (used to size the new column). */
  totalSpan: number;
  /** Span of each existing column in order, used to place insertion-point dividers. */
  columnSpans: number[];
  /** Child block ids currently rendered inside this columns block. */
  childBlockIds: string[];
};

type BlockDragContextValue = {
  scale: number;
  dragState: DragState | null;
  dropZones: DropZone[];
  registerBlock: (id: string, bounds: BlockBounds) => void;
  unregisterBlock: (id: string) => void;
  registerColumnBlock: (
    id: string,
    bounds: BlockBounds,
    totalSpan: number,
    columnSpans: number[],
    childBlockIds: string[]
  ) => void;
  unregisterColumnBlock: (id: string) => void;
  startDrag: (
    blockId: string,
    bounds: BlockBounds,
    mouseDocX: number,
    mouseDocY: number,
    ghostImageSrc?: string | null
  ) => void;
  moveDrag: (docX: number, docY: number) => void;
  endDrag: () => void;
};

export const BlockDragContext = createContext<BlockDragContextValue | null>(
  null
);

export function useBlockDragContext() {
  return useContext(BlockDragContext);
}

const BUFFER_ZONE = 0.08;

/**
 * Builds N+1 insertion-point zones for a columns block with N columns.
 *
 * Unlike before/after zones, column insertion should only win when the cursor
 * is close to an actual column divider. A fixed `BUFFER_ZONE * dpi` hit strip
 * around each divider keeps vertical insertion usable across most of the block.
 */
function computeColumnInsertZones(
  id: string,
  { bounds, totalSpan, columnSpans }: ColumnBlockEntry,
  dpi: number
): DropZone[] {
  const zones: DropZone[] = [];
  const N = columnSpans.length;
  const bufferPx = BUFFER_ZONE * dpi;

  // Cumulative width offsets for each divider (0 = left edge, N = right edge).
  const cumWidths: number[] = [0];
  for (const span of columnSpans) {
    cumWidths.push(
      cumWidths[cumWidths.length - 1] + (span / totalSpan) * bounds.width
    );
  }

  for (let i = 0; i <= N; i++) {
    const lineX = bounds.x + cumWidths[i];
    const minX = i === 0 ? bounds.x : lineX - bufferPx;
    const maxX = i === N ? bounds.x + bounds.width : lineX + bufferPx;

    zones.push({
      id: `column-insert:${id}:${i}`,
      targetBlockId: id,
      type: "column-insert",
      bounds: {
        x: minX,
        y: bounds.y,
        width: Math.max(0, maxX - minX),
        height: bounds.height,
      },
      lineX,
    });
  }

  return zones;
}

function computeDropZones(
  blocks: Map<string, BlockBounds>,
  columnBlocks: Map<string, ColumnBlockEntry>,
  draggingId: string,
  dpi: number
): DropZone[] {
  const zones: DropZone[] = [];
  const blocksInsideColumns = new Set<string>();

  // ── Column insertion zones (higher priority — checked first) ─────────────
  for (const [id, entry] of columnBlocks) {
    if (id === draggingId) continue;
    for (const childBlockId of entry.childBlockIds) {
      blocksInsideColumns.add(childBlockId);
    }
    zones.push(...computeColumnInsertZones(id, entry, dpi));
    // Away from a divider, the columns block behaves like one outer block:
    // top half inserts before the whole columns block, bottom half after it.
    const halfHeight = entry.bounds.height / 2;
    zones.push({
      id: `before:${id}`,
      targetBlockId: id,
      type: "before",
      bounds: {
        x: entry.bounds.x,
        y: entry.bounds.y,
        width: entry.bounds.width,
        height: halfHeight,
      },
      lineY: entry.bounds.y,
    });
    zones.push({
      id: `after:${id}`,
      targetBlockId: id,
      type: "after",
      bounds: {
        x: entry.bounds.x,
        y: entry.bounds.y + halfHeight,
        width: entry.bounds.width,
        height: halfHeight,
      },
      lineY: entry.bounds.y + entry.bounds.height,
    });
  }

  // ── Block before / after zones ────────────────────────────────────────────
  for (const [id, bounds] of blocks) {
    if (id === draggingId) continue;
    if (blocksInsideColumns.has(id)) continue;

    const halfHeight = bounds.height / 2;

    // "before": cursor on the top half → insert above.
    zones.push({
      id: `before:${id}`,
      targetBlockId: id,
      type: "before",
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: halfHeight,
      },
      lineY: bounds.y,
    });

    // "after": cursor on the bottom half → insert below.
    zones.push({
      id: `after:${id}`,
      targetBlockId: id,
      type: "after",
      bounds: {
        x: bounds.x,
        y: bounds.y + halfHeight,
        width: bounds.width,
        height: halfHeight,
      },
      lineY: bounds.y + bounds.height,
    });
  }

  return zones;
}

export function BlockDragProvider({
  children,
  scale,
  dpi,
}: {
  children: ReactNode;
  scale: number;
  dpi: number;
}) {
  const registeredBlocks = useRef<Map<string, BlockBounds>>(new Map());
  const registeredColumnBlocks = useRef<Map<string, ColumnBlockEntry>>(
    new Map()
  );
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropZones, setDropZones] = useState<DropZone[]>([]);
  // Refs keep the hot-path callbacks free of stale closure values.
  const dragStateRef = useRef<DragState | null>(null);
  const dropZonesRef = useRef<DropZone[]>([]);

  const registerBlock = useCallback((id: string, bounds: BlockBounds) => {
    registeredBlocks.current.set(id, bounds);
  }, []);

  const unregisterBlock = useCallback((id: string) => {
    registeredBlocks.current.delete(id);
  }, []);

  const registerColumnBlock = useCallback(
    (
      id: string,
      bounds: BlockBounds,
      totalSpan: number,
      columnSpans: number[],
      childBlockIds: string[]
    ) => {
      registeredColumnBlocks.current.set(id, {
        bounds,
        totalSpan,
        columnSpans,
        childBlockIds,
      });
    },
    []
  );

  const unregisterColumnBlock = useCallback((id: string) => {
    registeredColumnBlocks.current.delete(id);
  }, []);

  const startDrag = useCallback(
    (
      blockId: string,
      bounds: BlockBounds,
      mouseDocX: number,
      mouseDocY: number,
      ghostImageSrc?: string | null
    ) => {
      const zones = computeDropZones(
        registeredBlocks.current,
        registeredColumnBlocks.current,
        blockId,
        dpi
      );
      const state: DragState = {
        draggingBlockId: blockId,
        originalBounds: bounds,
        offsetX: mouseDocX - bounds.x,
        offsetY: mouseDocY - bounds.y,
        ghostX: bounds.x,
        ghostY: bounds.y,
        activeDropZoneId: null,
        ghostImageSrc: ghostImageSrc ?? null,
      };
      dragStateRef.current = state;
      dropZonesRef.current = zones;
      setDragState(state);
      setDropZones(zones);
    },
    [dpi]
  );

  const moveDrag = useCallback((docX: number, docY: number) => {
    const prev = dragStateRef.current;
    if (!prev) return;

    const ghostX = docX - prev.offsetX;
    const ghostY = docY - prev.offsetY;

    const zones = dropZonesRef.current;
    const activeDropZone = zones.find(
      (dz) =>
        docX >= dz.bounds.x &&
        docX <= dz.bounds.x + dz.bounds.width &&
        docY >= dz.bounds.y &&
        docY <= dz.bounds.y + dz.bounds.height
    );

    const next: DragState = {
      ...prev,
      ghostX,
      ghostY,
      activeDropZoneId: activeDropZone?.id ?? null,
    };
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    dropZonesRef.current = [];
    setDragState(null);
    setDropZones([]);
  }, []);

  const value = useMemo<BlockDragContextValue>(
    () => ({
      scale,
      dragState,
      dropZones,
      registerBlock,
      unregisterBlock,
      registerColumnBlock,
      unregisterColumnBlock,
      startDrag,
      moveDrag,
      endDrag,
    }),
    [
      scale,
      dragState,
      dropZones,
      registerBlock,
      unregisterBlock,
      registerColumnBlock,
      unregisterColumnBlock,
      startDrag,
      moveDrag,
      endDrag,
    ]
  );

  return (
    <BlockDragContext.Provider value={value}>
      {children}
    </BlockDragContext.Provider>
  );
}
