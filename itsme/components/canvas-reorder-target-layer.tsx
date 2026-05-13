"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect, Text } from "react-konva";
import {
  applyBlockMove,
  applyInsertSubtreeAtDestination,
  isMoveIntoOwnSubtree,
  isNestedInsideBlock,
  pruneStaleLayoutReferences,
  type MoveBlockUpdate,
} from "@/blocks/apply-block-move";
import type { Block } from "@/blocks/blocks";
import {
  asAddBlockAction,
  asMoveBlockAction,
  asPasteBlockAction,
  documentBlocksSnapshotToDocument,
  selectAddBlockAction,
  selectMoveBlockAction,
  selectPasteBlockAction,
  type DocumentBlocksSnapshot,
  type DocumentStoreMoveBlockAction,
  useDocument,
} from "@/blocks/document-context";
import { parseCopyPasteClipboardPayload } from "@/blocks/copy-paste-clipboard";
import type {
  BlockTree,
  BlockTreeReorderBoundingBox,
  Pos,
} from "@/blocks/renderer-types";
import { nanoid } from "nanoid";
import { useStore } from "zustand/react";

const CLIENT_ID_PREFIX = "CLIENT_ID:" as const;

function createClientId(args: { kind: string }): string {
  const token = nanoid(12);
  return `${CLIENT_ID_PREFIX}${args.kind}-${token}`;
}

type ParentRef =
  | { container: "document"; index: number }
  | {
      container: "section" | "list";
      parentBlockId: string;
      index: number;
    }
  | {
      container: "columns";
      parentBlockId: string;
      index: number;
      span: number;
    };

function cloneSnapshot(
  snapshot: DocumentBlocksSnapshot
): DocumentBlocksSnapshot {
  return {
    document: snapshot.document,
    layout: [...snapshot.layout],
    blocks: snapshot.blocks.map((block) => {
      switch (block.type) {
        case "section":
        case "list":
          return { ...block, blocks: [...block.blocks] };
        case "columns":
          return {
            ...block,
            blocks: block.blocks.map((child) => ({ ...child })),
          };
        case "text":
          return block;
      }
    }),
  };
}

/** Resolves parent container using the rendered block tree plus snapshot structure. */
function findParentRefFromBlockTree(
  blockTree: BlockTree,
  snapshot: DocumentBlocksSnapshot,
  childBlockId: string
): ParentRef | null {
  // Prefer tree parent over `layout` so nested placement wins if ids are
  // duplicated (stale layout + column child).
  const parentId = blockTree.getDirectParentOf(childBlockId);
  if (parentId !== null) {
    const parent = snapshot.blocks.find((b) => b.id === parentId);
    if (!parent) {
      return null;
    }
    switch (parent.type) {
      case "section":
      case "list": {
        const index = parent.blocks.indexOf(childBlockId);
        if (index < 0) return null;
        return {
          container: parent.type,
          parentBlockId: parent.id,
          index,
        };
      }
      case "columns": {
        const index = parent.blocks.findIndex((c) => c.blockId === childBlockId);
        if (index < 0) return null;
        return {
          container: "columns",
          parentBlockId: parent.id,
          index,
          span: parent.blocks[index].span,
        };
      }
      case "text":
        return null;
    }
  }

  const documentIndex = snapshot.layout.indexOf(
    childBlockId as (typeof snapshot.layout)[number]
  );
  if (documentIndex >= 0) {
    return { container: "document", index: documentIndex };
  }
  return null;
}

function getBlockWidthPx(blockTree: BlockTree, blockId: string): number {
  const topBox = blockTree
    .getReorderBoundingBoxes()
    .find((box) => box.blockId === blockId && box.type === "top");
  if (!topBox) {
    return 1;
  }
  return Math.max(1, topBox.target.to.x - topBox.target.from.x);
}

function applyMovesToSnapshot(
  snapshot: DocumentBlocksSnapshot,
  updates: MoveBlockUpdate[]
): DocumentBlocksSnapshot {
  const doc = documentBlocksSnapshotToDocument(snapshot);
  const nextDoc = updates.reduce(
    (acc, update) => applyBlockMove(acc, update),
    doc
  );
  return {
    ...snapshot,
    blocks: nextDoc.blocks,
    layout: nextDoc.layout as DocumentBlocksSnapshot["layout"],
  };
}

/**
 * Phase 2: if a columns block has a columns child, inline that child’s columns
 * into the parent (span-scaled) and drop the inner columns row. Repeats until
 * no columns block has a direct columns child.
 */
function mergeNestedColumnBlocksInSnapshot(
  snapshot: DocumentBlocksSnapshot
): DocumentBlocksSnapshot {
  const next = cloneSnapshot(snapshot);
  const blockById = new Map(next.blocks.map((b) => [b.id, b]));
  const toDelete = new Set<string>();

  function flattenColumnsChildren(
    col: Extract<Block, { type: "columns" }>
  ): boolean {
    let anyChange = false;
    let i = 0;
    while (i < col.blocks.length) {
      const entry = col.blocks[i];
      const child = blockById.get(entry.blockId);
      if (child?.type === "columns") {
        anyChange = true;
        const inner = child;
        const innerTotal =
          inner.blocks.reduce((sum, c) => sum + c.span, 0) || 1;
        const scale = entry.span / innerTotal;
        const replacements = inner.blocks.map((ic) => ({
          blockId: ic.blockId,
          span: Math.max(0.1, ic.span * scale),
        }));
        col.blocks.splice(i, 1, ...replacements);
        toDelete.add(inner.id);
        continue;
      }
      i += 1;
    }
    return anyChange;
  }

  let passChanged = true;
  while (passChanged) {
    passChanged = false;
    for (const block of next.blocks) {
      if (block.type === "columns" && !toDelete.has(block.id)) {
        if (flattenColumnsChildren(block)) {
          passChanged = true;
        }
      }
    }
  }

  if (toDelete.size === 0) {
    return next;
  }

  return {
    ...next,
    blocks: next.blocks.filter((b) => !toDelete.has(b.id)),
  };
}

function finalizeSnapshotAfterReorder(
  phase1: DocumentBlocksSnapshot
): DocumentBlocksSnapshot {
  const merged = mergeNestedColumnBlocksInSnapshot(phase1);
  const doc = documentBlocksSnapshotToDocument(merged);
  const pruned = pruneStaleLayoutReferences(doc);
  return {
    ...merged,
    blocks: pruned.blocks,
    layout: pruned.layout as DocumentBlocksSnapshot["layout"],
  };
}

/** Computes resulting snapshot for canvas reorder drops. */
export function buildMoveUpdatesForReorder(args: {
  snapshot: DocumentBlocksSnapshot;
  move: DocumentStoreMoveBlockAction;
  blockTree: BlockTree;
}): DocumentBlocksSnapshot | null {
  const { snapshot, move, blockTree } = args;
  const documentId = snapshot.document.id;
  const document = documentBlocksSnapshotToDocument(snapshot);
  const movingBlockId = move.current.blockIds[0];
  if (!movingBlockId) {
    return null;
  }

  const targetBox = move.targetBlock;
  if (!targetBox) {
    return null;
  }

  // Inner: append into a list block's children.
  if (targetBox.type === "inner") {
    const targetBlock = snapshot.blocks.find(
      (b): b is Extract<Block, { type: "list" }> =>
        b.id === targetBox.blockId && b.type === "list"
    );
    if (!targetBlock) {
      return null;
    }
    const update: MoveBlockUpdate = {
      type: "move",
      documentId,
      blockId: movingBlockId,
      destination: {
        container: "list",
        parentBlockId: targetBlock.id,
        index: targetBlock.blocks.length,
      },
    };
    if (isMoveIntoOwnSubtree(document, movingBlockId, update.destination)) {
      return null;
    }
    const phase1 = applyMovesToSnapshot(snapshot, [update]);
    return finalizeSnapshotAfterReorder(phase1);
  }

  const targetParent = findParentRefFromBlockTree(
    blockTree,
    snapshot,
    targetBox.blockId
  );
  if (!targetParent) {
    return null;
  }

  // Top/Bottom: before/after target inside the same container.
  if (targetBox.type === "top" || targetBox.type === "bottom") {
    const offset = targetBox.type === "bottom" ? 1 : 0;
    let update: MoveBlockUpdate | null = null;
    switch (targetParent.container) {
      case "document":
        update = {
          type: "move",
          documentId,
          blockId: movingBlockId,
          destination: {
            container: "document",
            index: targetParent.index + offset,
          },
        };
        break;
      case "section":
      case "list":
        update = {
          type: "move",
          documentId,
          blockId: movingBlockId,
          destination: {
            container: targetParent.container,
            parentBlockId: targetParent.parentBlockId,
            index: targetParent.index + offset,
          },
        };
        break;
      case "columns":
        update = {
          type: "move",
          documentId,
          blockId: movingBlockId,
          destination: {
            container: "columns",
            parentBlockId: targetParent.parentBlockId,
            index: targetParent.index + offset,
            span: targetParent.span,
          },
        };
        break;
    }
    if (!update) {
      return null;
    }
    if (isMoveIntoOwnSubtree(document, movingBlockId, update.destination)) {
      return null;
    }
    const phase1 = applyMovesToSnapshot(snapshot, [update]);
    return finalizeSnapshotAfterReorder(phase1);
  }

  // Left/Right: insert into columns or wrap into new columns.
  if (targetParent.container === "columns") {
    const columnsBlock = snapshot.blocks.find(
      (b): b is Extract<Block, { type: "columns" }> =>
        b.id === targetParent.parentBlockId && b.type === "columns"
    );
    if (!columnsBlock) {
      return null;
    }
    const sourceWidth = getBlockWidthPx(blockTree, movingBlockId);
    const targetWidth = getBlockWidthPx(blockTree, targetBox.blockId);
    const currentTotalSpan =
      columnsBlock.blocks.reduce((sum, child) => sum + child.span, 0) || 1;
    const sourceSpan = Math.max(
      0.1,
      currentTotalSpan * (sourceWidth / Math.max(1, targetWidth))
    );
    const update: MoveBlockUpdate = {
      type: "move",
      documentId,
      blockId: movingBlockId,
      destination: {
        container: "columns",
        parentBlockId: targetParent.parentBlockId,
        index: targetParent.index + (targetBox.type === "right" ? 1 : 0),
        span: sourceSpan,
      },
    };
    if (isMoveIntoOwnSubtree(document, movingBlockId, update.destination)) {
      return null;
    }
    const phase1 = applyMovesToSnapshot(snapshot, [update]);
    return finalizeSnapshotAfterReorder(phase1);
  }

  if (
    movingBlockId === targetBox.blockId ||
    isNestedInsideBlock(document, movingBlockId, targetBox.blockId)
  ) {
    return null;
  }

  // Phase 1 — wrap target and moving block in a new columns row (inline snapshot edit).
  const next = cloneSnapshot(snapshot);
  const sourceParent = findParentRefFromBlockTree(
    blockTree,
    next,
    movingBlockId
  );
  let targetParentMutable = findParentRefFromBlockTree(
    blockTree,
    next,
    targetBox.blockId
  );
  if (!sourceParent || !targetParentMutable) {
    return null;
  }

  const removeFromParent = (parent: ParentRef, blockId: string) => {
    if (parent.container === "document") {
      next.layout = next.layout.filter((id) => id !== blockId);
      return;
    }
    const parentBlock = next.blocks.find((b) => b.id === parent.parentBlockId);
    if (!parentBlock) return;
    if (parent.container === "columns" && parentBlock.type === "columns") {
      parentBlock.blocks = parentBlock.blocks.filter(
        (child) => child.blockId !== blockId
      );
      return;
    }
    if (
      (parent.container === "section" && parentBlock.type === "section") ||
      (parent.container === "list" && parentBlock.type === "list")
    ) {
      parentBlock.blocks = parentBlock.blocks.filter((id) => id !== blockId);
    }
  };

  removeFromParent(sourceParent, movingBlockId);
  targetParentMutable = findParentRefFromBlockTree(
    blockTree,
    next,
    targetBox.blockId
  );
  if (!targetParentMutable) {
    return null;
  }

  const newColumnsId = createClientId({ kind: "columns" });
  const movingWidth = getBlockWidthPx(blockTree, movingBlockId);
  const targetWidth = getBlockWidthPx(blockTree, targetBox.blockId);
  const movingSpan = Math.max(0.1, movingWidth / Math.max(1, targetWidth));
  const targetSpan = 1;
  const orderedChildren =
    targetBox.type === "left"
      ? [
          { blockId: movingBlockId, span: movingSpan },
          { blockId: targetBox.blockId, span: targetSpan },
        ]
      : [
          { blockId: targetBox.blockId, span: targetSpan },
          { blockId: movingBlockId, span: movingSpan },
        ];

  const newColumnsBlock: Extract<Block, { type: "columns" }> = {
    type: "columns",
    id: newColumnsId,
    blocks: orderedChildren,
  };
  next.blocks.push(newColumnsBlock);

  if (targetParentMutable.container === "document") {
    next.layout[targetParentMutable.index] =
      newColumnsId as (typeof next.layout)[number];
  } else {
    const parentBlock = next.blocks.find(
      (b) => b.id === targetParentMutable.parentBlockId
    );
    if (!parentBlock) {
      return null;
    }
    if (
      targetParentMutable.container === "section" &&
      parentBlock.type === "section"
    ) {
      parentBlock.blocks[targetParentMutable.index] =
        newColumnsId as (typeof parentBlock.blocks)[number];
    } else if (
      targetParentMutable.container === "list" &&
      parentBlock.type === "list"
    ) {
      parentBlock.blocks[targetParentMutable.index] =
        newColumnsId as (typeof parentBlock.blocks)[number];
    } else {
      return null;
    }
  }

  return finalizeSnapshotAfterReorder(next);
}

export type AddBlockPlacementResult = {
  snapshot: DocumentBlocksSnapshot;
  insertedBlockId: string;
};

/** Places an existing subtree (root first, then descendants) using the same drop targets as add-block (merge excluded). */
export function buildNextDocumentForBlockPlacement(args: {
  snapshot: DocumentBlocksSnapshot;
  blockTree: BlockTree;
  newSubtreeBlocks: Block[];
  targetBox: BlockTreeReorderBoundingBox;
}): AddBlockPlacementResult | null {
  const { snapshot, blockTree, newSubtreeBlocks, targetBox } = args;
  if (newSubtreeBlocks.length === 0) {
    return null;
  }
  const newRoot = newSubtreeBlocks[0]!;
  const document = documentBlocksSnapshotToDocument(snapshot);

  // Inner: append the new block to a list's children.
  if (targetBox.type === "inner") {
    const targetBlock = snapshot.blocks.find(
      (b): b is Extract<Block, { type: "list" }> =>
        b.id === targetBox.blockId && b.type === "list"
    );
    if (!targetBlock) {
      return null;
    }
    const destination: MoveBlockUpdate["destination"] = {
      container: "list",
      parentBlockId: targetBlock.id,
      index: targetBlock.blocks.length,
    };
    const phase1 = applyInsertSubtreeAtDestination(
      document,
      newSubtreeBlocks,
      destination
    );
    if (!phase1) {
      return null;
    }
    const phase1Snapshot: DocumentBlocksSnapshot = {
      ...snapshot,
      blocks: phase1.blocks,
      layout: phase1.layout as DocumentBlocksSnapshot["layout"],
    };
    return {
      snapshot: finalizeSnapshotAfterReorder(phase1Snapshot),
      insertedBlockId: newRoot.id,
    };
  }

  const targetParent = findParentRefFromBlockTree(
    blockTree,
    snapshot,
    targetBox.blockId
  );
  if (!targetParent) {
    return null;
  }

  if (targetBox.type === "top" || targetBox.type === "bottom") {
    const offset = targetBox.type === "bottom" ? 1 : 0;
    let destination: MoveBlockUpdate["destination"];
    switch (targetParent.container) {
      case "document":
        destination = {
          container: "document",
          index: targetParent.index + offset,
        };
        break;
      case "section":
      case "list":
        destination = {
          container: targetParent.container,
          parentBlockId: targetParent.parentBlockId,
          index: targetParent.index + offset,
        };
        break;
      case "columns":
        destination = {
          container: "columns",
          parentBlockId: targetParent.parentBlockId,
          index: targetParent.index + offset,
          span: targetParent.span,
        };
        break;
    }
    const phase1 = applyInsertSubtreeAtDestination(
      document,
      newSubtreeBlocks,
      destination
    );
    if (!phase1) {
      return null;
    }
    const phase1Snapshot: DocumentBlocksSnapshot = {
      ...snapshot,
      blocks: phase1.blocks,
      layout: phase1.layout as DocumentBlocksSnapshot["layout"],
    };
    return {
      snapshot: finalizeSnapshotAfterReorder(phase1Snapshot),
      insertedBlockId: newRoot.id,
    };
  }

  if (targetParent.container === "columns") {
    const columnsBlock = snapshot.blocks.find(
      (b): b is Extract<Block, { type: "columns" }> =>
        b.id === targetParent.parentBlockId && b.type === "columns"
    );
    if (!columnsBlock) {
      return null;
    }
    const targetWidth = getBlockWidthPx(blockTree, targetBox.blockId);
    const currentTotalSpan =
      columnsBlock.blocks.reduce((sum, child) => sum + child.span, 0) || 1;
    const assumedNewWidth = Math.max(1, targetWidth * 0.45);
    const newSpan = Math.max(
      0.1,
      currentTotalSpan * (assumedNewWidth / Math.max(1, targetWidth))
    );
    const destination: MoveBlockUpdate["destination"] = {
      container: "columns",
      parentBlockId: targetParent.parentBlockId,
      index: targetParent.index + (targetBox.type === "right" ? 1 : 0),
      span: newSpan,
    };
    const phase1 = applyInsertSubtreeAtDestination(
      document,
      newSubtreeBlocks,
      destination
    );
    if (!phase1) {
      return null;
    }
    const phase1Snapshot: DocumentBlocksSnapshot = {
      ...snapshot,
      blocks: phase1.blocks,
      layout: phase1.layout as DocumentBlocksSnapshot["layout"],
    };
    return {
      snapshot: finalizeSnapshotAfterReorder(phase1Snapshot),
      insertedBlockId: newRoot.id,
    };
  }

  const next = cloneSnapshot(snapshot);
  for (const b of newSubtreeBlocks) {
    next.blocks.push(b);
  }

  const targetParentMutable = findParentRefFromBlockTree(
    blockTree,
    next,
    targetBox.blockId
  );
  if (!targetParentMutable) {
    return null;
  }

  const newColumnsId = createClientId({ kind: "columns" });
  const targetWidth = getBlockWidthPx(blockTree, targetBox.blockId);
  const assumedNewWidth = Math.max(1, targetWidth * 0.45);
  const movingSpan = Math.max(0.1, assumedNewWidth / Math.max(1, targetWidth));
  const targetSpan = 1;
  const orderedChildren =
    targetBox.type === "left"
      ? [
          { blockId: newRoot.id, span: movingSpan },
          { blockId: targetBox.blockId, span: targetSpan },
        ]
      : [
          { blockId: targetBox.blockId, span: targetSpan },
          { blockId: newRoot.id, span: movingSpan },
        ];

  const newColumnsBlock: Extract<Block, { type: "columns" }> = {
    type: "columns",
    id: newColumnsId,
    blocks: orderedChildren,
  };
  next.blocks.push(newColumnsBlock);

  if (targetParentMutable.container === "document") {
    next.layout[targetParentMutable.index] =
      newColumnsId as (typeof next.layout)[number];
  } else {
    const parentBlock = next.blocks.find(
      (b) => b.id === targetParentMutable.parentBlockId
    );
    if (!parentBlock) {
      return null;
    }
    if (
      targetParentMutable.container === "section" &&
      parentBlock.type === "section"
    ) {
      parentBlock.blocks[targetParentMutable.index] =
        newColumnsId as (typeof parentBlock.blocks)[number];
    } else if (
      targetParentMutable.container === "list" &&
      parentBlock.type === "list"
    ) {
      parentBlock.blocks[targetParentMutable.index] =
        newColumnsId as (typeof parentBlock.blocks)[number];
    } else {
      return null;
    }
  }

  return {
    snapshot: finalizeSnapshotAfterReorder(next),
    insertedBlockId: newRoot.id,
  };
}

/** Places a new text/list block using the same drop targets as block reorder (merge excluded). */
export function buildNextDocumentForAddBlockPlacement(args: {
  snapshot: DocumentBlocksSnapshot;
  blockTree: BlockTree;
  blockType: "text" | "list";
  targetBox: BlockTreeReorderBoundingBox;
}): AddBlockPlacementResult | null {
  const { blockType, ...rest } = args;
  const newId = createClientId({ kind: blockType });
  const newBlock: Block =
    blockType === "text"
      ? {
          id: newId,
          type: "text",
          text: "",
          align: "left",
          style: "default",
        }
      : {
          id: newId,
          type: "list",
          blocks: [],
          bullet: { type: "normal", value: "-" },
        };
  return buildNextDocumentForBlockPlacement({
    ...rest,
    newSubtreeBlocks: [newBlock],
  });
}

/**
 * Highlights reorder drop targets (edge strips) under a canvas-space pointer.
 * Shared by move-block drag and add-block placement.
 */
export function CanvasReorderTargetLayer(props: {
  pointerCanvasPos: Pos | null;
  onActiveTargetChange: (target: BlockTreeReorderBoundingBox | null) => void;
}) {
  const { pointerCanvasPos, onActiveTargetChange } = props;
  const { blockTree } = useDocument();
  const boxes = blockTree.getReorderBoundingBoxes();
  const [targetIndex, setTargetIndex] = useState(0);

  const intersectionTargets = useMemo(() => {
    const targets: (typeof boxes)[number][] = [];
    if (pointerCanvasPos === null) {
      return targets;
    }

    for (let i = boxes.length - 1; i >= 0; i -= 1) {
      const box = boxes[i];
      if (
        pointerCanvasPos.x >= box.target.from.x &&
        pointerCanvasPos.x <= box.target.to.x &&
        pointerCanvasPos.y >= box.target.from.y &&
        pointerCanvasPos.y <= box.target.to.y
      ) {
        targets.push(box);
      }
    }
    return targets;
  }, [boxes, pointerCanvasPos]);

  const intersectionKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const t of intersectionTargets) {
      set.add(`${t.blockId}:${t.type}`);
    }
    return set;
  }, [intersectionTargets]);

  const intersectionSignature = useMemo(
    () =>
      intersectionTargets
        .map(
          (box) =>
            `${box.blockId}:${box.type}:${box.target.from.x}:${box.target.from.y}:${box.target.to.x}:${box.target.to.y}`
        )
        .join("|"),
    [intersectionTargets]
  );

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setTargetIndex(0);
    }, 0);
    if (intersectionTargets.length <= 1) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setInterval(() => {
      setTargetIndex((prev) => {
        if (prev >= intersectionTargets.length - 1) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(timer);
    };
  }, [intersectionSignature, intersectionTargets.length]);

  const nextReorderTarget =
    intersectionTargets[
      Math.min(targetIndex, intersectionTargets.length - 1)
    ] ?? null;

  useEffect(() => {
    onActiveTargetChange(nextReorderTarget);
  }, [nextReorderTarget, onActiveTargetChange]);

  /** Block ids whose full layout rect contains the pointer (not only edge strips). */
  const blocksUnderPointer = useMemo(() => {
    const set = new Set<string>();
    if (pointerCanvasPos === null) {
      return set;
    }
    const byId = new Map<string, (typeof boxes)[number][]>();
    for (const b of boxes) {
      const list = byId.get(b.blockId);
      if (list) {
        list.push(b);
      } else {
        byId.set(b.blockId, [b]);
      }
    }
    const { x: px, y: py } = pointerCanvasPos;
    for (const [, blockBoxes] of byId) {
      const top = blockBoxes.find((b) => b.type === "top");
      const bottom = blockBoxes.find((b) => b.type === "bottom");
      if (!top || !bottom) continue;
      const x0 = top.visual.from.x;
      const y0 = top.visual.from.y;
      const x1 = bottom.visual.to.x;
      const y1 = bottom.visual.to.y;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        set.add(top.blockId);
      }
    }
    return set;
  }, [boxes, pointerCanvasPos]);

  if (pointerCanvasPos === null) {
    return null;
  }

  const reorderTarget = nextReorderTarget;

  return (
    <>
      {boxes.map((box) => {
        const key = `${box.blockId}:${box.type}`;
        const isInner = box.type === "inner";
        const isActive =
          reorderTarget != null &&
          reorderTarget.blockId === box.blockId &&
          reorderTarget.type === box.type;
        const baseRect = {
          x: box.visual.from.x,
          y: box.visual.from.y,
          width: box.visual.to.x - box.visual.from.x,
          height: box.visual.to.y - box.visual.from.y,
          perfectDrawEnabled: false,
          listening: false,
        } as const;
        if (isActive) {
          if (isInner) {
            return (
              <Rect
                key={`reorder-target-${key}`}
                {...baseRect}
                fill="#fff7ea"
                stroke="#e37100"
                strokeWidth={1}
                opacity={0.45}
              />
            );
          }
          return (
            <Rect
              key={`reorder-target-${key}`}
              {...baseRect}
              fill="#ea580c"
              opacity={0.9}
            />
          );
        }
        const showBlueHighlight =
          intersectionKeySet.has(key) || blocksUnderPointer.has(box.blockId);
        if (!showBlueHighlight) {
          return null;
        }
        if (isInner) {
          return (
            <Rect
              key={`reorder-target-${key}`}
              {...baseRect}
              fill="#fff7ea"
              stroke="#e37100"
              strokeWidth={1}
              opacity={0.45}
            />
          );
        }
        return (
          <Rect key={`reorder-target-${key}`} {...baseRect} fill="#51A2FF" />
        );
      })}
    </>
  );
}

export function MoveReorderLayer() {
  const { documentStore } = useDocument();
  const moveAction = useStore(documentStore, selectMoveBlockAction);
  const setAction = useStore(documentStore, (s) => s.setAction);

  const syncMoveTarget = useCallback(
    (target: BlockTreeReorderBoundingBox | null) => {
      setAction((current) => {
        const m = asMoveBlockAction(current);
        if (!m) return current;
        if (m.targetBlock === target) return current;
        return { ...m, targetBlock: target };
      });
    },
    [setAction]
  );

  if (!moveAction) {
    return null;
  }

  return (
    <CanvasReorderTargetLayer
      pointerCanvasPos={moveAction.current.position}
      onActiveTargetChange={syncMoveTarget}
    />
  );
}

export function AddBlockPlacementLayer({
  scale,
  stageWidth,
  stageHeight,
}: {
  scale: number;
  stageWidth: number;
  stageHeight: number;
}) {
  const { documentStore, updateBlocks, blockTree, document } = useDocument();
  const addAction = useStore(documentStore, selectAddBlockAction);
  const pasteAction = useStore(documentStore, selectPasteBlockAction);
  const placementAction = addAction ?? pasteAction;
  const setAction = useStore(documentStore, (s) => s.setAction);

  const pointer = placementAction?.current?.position ?? null;
  const blockLabel = pasteAction
    ? "Paste"
    : addAction?.blockType === "list"
      ? "List"
      : "Text";
  /** Dev Strict Mode may invoke state updaters twice; cache one placement result per commit. */
  const placementSnapshotCacheRef = useRef<DocumentBlocksSnapshot | null>(null);

  const syncPlacementTarget = useCallback(
    (target: BlockTreeReorderBoundingBox | null) => {
      setAction((c) => {
        const add = asAddBlockAction(c);
        if (add) {
          if (add.targetBlock === target) return c;
          return { ...add, targetBlock: target };
        }
        const paste = asPasteBlockAction(c);
        if (paste) {
          if (paste.targetBlock === target) return c;
          return { ...paste, targetBlock: target };
        }
        return c;
      });
    },
    [setAction]
  );

  const commitPlacement = useCallback(async () => {
    const raw = documentStore.getState().action;
    const add = asAddBlockAction(raw);
    const paste = asPasteBlockAction(raw);
    if (!document) {
      return;
    }

    let targetBox: BlockTreeReorderBoundingBox | null = null;
    let blockType: "text" | "list" | null = null;
    let newSubtreeForPaste: Block[] | null = null;

    if (add?.targetBlock) {
      targetBox = add.targetBlock;
      blockType = add.blockType;
    } else if (paste?.targetBlock) {
      targetBox = paste.targetBlock;
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      newSubtreeForPaste = parseCopyPasteClipboardPayload(text);
      if (!newSubtreeForPaste?.length) {
        return;
      }
    } else {
      return;
    }

    let insertedBlockId: string | null = null;
    placementSnapshotCacheRef.current = null;
    let beforePlacement: DocumentBlocksSnapshot | null = null;
    updateBlocks(
      (current) => {
        const cached = placementSnapshotCacheRef.current;
        if (cached) {
          return cached;
        }
        const placed = blockType
          ? buildNextDocumentForAddBlockPlacement({
              snapshot: current,
              blockTree,
              blockType,
              targetBox: targetBox!,
            })
          : buildNextDocumentForBlockPlacement({
              snapshot: current,
              blockTree,
              newSubtreeBlocks: newSubtreeForPaste!,
              targetBox: targetBox!,
            });
        if (!placed) {
          return current;
        }
        if (!beforePlacement) {
          beforePlacement = structuredClone(current);
        }
        insertedBlockId = placed.insertedBlockId;
        placementSnapshotCacheRef.current = placed.snapshot;
        return placed.snapshot;
      },
      {
        down: () => {
          if (beforePlacement) {
            updateBlocks(() => structuredClone(beforePlacement!));
          }
        },
      }
    );
    setAction(null);
    const shouldOpenTextEdit =
      insertedBlockId != null &&
      (blockType === "text" || newSubtreeForPaste?.[0]?.type === "text");
    if (shouldOpenTextEdit && insertedBlockId != null) {
      documentStore.getState().setAction({
        type: "edit-block",
        blockId: insertedBlockId,
      });
    }
  }, [blockTree, document, documentStore, setAction, updateBlocks]);

  if (!placementAction) {
    return null;
  }

  return (
    <>
      <CanvasReorderTargetLayer
        pointerCanvasPos={pointer}
        onActiveTargetChange={syncPlacementTarget}
      />
      {pointer && (
        <Group x={pointer.x + 14} y={pointer.y + 14} listening={false}>
          <Rect
            width={140}
            height={40}
            stroke="#ea580c"
            strokeWidth={2}
            dash={[5, 5]}
            cornerRadius={4}
            fill="rgba(255,255,255,0.92)"
          />
          <Text
            text={blockLabel}
            width={140}
            height={40}
            align="center"
            verticalAlign="middle"
            fontSize={24}
            fontFamily="system-ui, sans-serif"
            fill="#0f172a"
          />
        </Group>
      )}
      <Rect
        x={0}
        y={0}
        width={stageWidth}
        height={stageHeight}
        fill="transparent"
        onMouseMove={(e) => {
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          setAction((c) => {
            const add = asAddBlockAction(c);
            if (add) {
              return {
                ...add,
                current: {
                  position: { x: p.x / scale, y: p.y / scale },
                },
              };
            }
            const paste = asPasteBlockAction(c);
            if (paste) {
              return {
                ...paste,
                current: {
                  position: { x: p.x / scale, y: p.y / scale },
                },
              };
            }
            return c;
          });
        }}
        onMouseLeave={() => {
          setAction((c) => {
            const add = asAddBlockAction(c);
            if (add) {
              return { ...add, current: null, targetBlock: null };
            }
            const paste = asPasteBlockAction(c);
            if (paste) {
              return { ...paste, current: null, targetBlock: null };
            }
            return c;
          });
        }}
        onClick={(e) => {
          e.cancelBubble = true;
          void commitPlacement();
        }}
      />
    </>
  );
}
