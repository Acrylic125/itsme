import z from "zod";
import { DocumentSchema } from "./renderer";
import { newClientBlockId } from "./core/client-ids";
import {
  collectSubtreeIdsInto,
  findParentRef,
  getChildBlockIds,
  isDescendantOf,
  pruneStaleLayoutReferences,
  type ParentRef,
} from "./core/graph";

export { newClientBlockId } from "./core/client-ids";
export {
  collectSubtreeBlocksInDocumentOrder,
  getParentBlockId,
  isNestedInsideBlock,
  pruneStaleLayoutReferences,
  sanitizeRootLayout,
} from "./core/graph";

/** Discriminant from drag-and-drop; defined here so block logic does not depend on UI modules. */
export type DropZone =
  | { type: "column-insert"; targetBlockId: string; id: string }
  | { type: "before" | "after"; targetBlockId: string };

export const MoveBlockDestinationSchema = z.discriminatedUnion("container", [
  z.object({
    container: z.literal("document"),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    container: z.literal("section"),
    parentBlockId: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    container: z.literal("list"),
    parentBlockId: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    container: z.literal("columns"),
    parentBlockId: z.string(),
    index: z.number().int().nonnegative(),
    span: z.number().positive(),
  }),
]);

export const MoveBlockUpdateSchema = z.object({
  type: z.literal("move"),
  documentId: z.string(),
  blockId: z.string(),
  destination: MoveBlockDestinationSchema,
});

type Document = z.infer<typeof DocumentSchema>;
export type MoveBlockUpdate = z.infer<typeof MoveBlockUpdateSchema>;

function createClientIdForDuplicate(kind: string): string {
  return newClientBlockId(kind);
}

function isInvalidNestedDestination(
  doc: Document,
  blockId: string,
  destinationParentBlockId: string | null
): boolean {
  if (destinationParentBlockId === null) return false;
  return (
    destinationParentBlockId === blockId ||
    isDescendantOf(doc, destinationParentBlockId, blockId)
  );
}

function destinationParentBlockId(
  destination: MoveBlockUpdate["destination"]
): string | null {
  if (destination.container === "document") {
    return null;
  }
  return destination.parentBlockId;
}

/** Moving would place the block inside its own subtree (invalid). */
export function isMoveIntoOwnSubtree(
  doc: Document,
  movingBlockId: string,
  destination: MoveBlockUpdate["destination"]
): boolean {
  return isInvalidNestedDestination(
    doc,
    movingBlockId,
    destinationParentBlockId(destination)
  );
}

function sameContainer(
  a: ParentRef,
  b: MoveBlockUpdate["destination"]
): boolean {
  if (a.container !== b.container) return false;
  if (a.container === "document") return true;
  if (b.container === "document") return false;
  return a.parentBlockId === b.parentBlockId;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

export function createMoveBlockUpdateFromDropZone(args: {
  document: Document;
  documentId: string;
  blockId: string;
  dropZone: DropZone;
}): MoveBlockUpdate | null {
  const { document, documentId, blockId, dropZone } = args;

  if (dropZone.type !== "column-insert" && dropZone.targetBlockId === blockId) {
    return null;
  }

  if (dropZone.type === "column-insert") {
    if (isInvalidNestedDestination(document, blockId, dropZone.targetBlockId)) {
      return null;
    }

    const columnsBlock = document.blocks.find(
      (
        block
      ): block is Extract<Document["blocks"][number], { type: "columns" }> =>
        block.id === dropZone.targetBlockId && block.type === "columns"
    );
    if (!columnsBlock) return null;

    const insertIndex = Number(dropZone.id.split(":").at(-1));
    if (!Number.isFinite(insertIndex)) return null;

    const span =
      columnsBlock.blocks.reduce((sum, child) => sum + child.span, 0) || 1;

    return {
      type: "move",
      documentId,
      blockId,
      destination: {
        container: "columns",
        parentBlockId: columnsBlock.id,
        index: insertIndex,
        span,
      },
    };
  }

  const targetParent = findParentRef(document, dropZone.targetBlockId);
  if (!targetParent) return null;

  const destinationParentBlockId =
    targetParent.container === "document" ? null : targetParent.parentBlockId;
  if (isInvalidNestedDestination(document, blockId, destinationParentBlockId)) {
    return null;
  }

  const offset = dropZone.type === "after" ? 1 : 0;

  switch (targetParent.container) {
    case "document":
      return {
        type: "move",
        documentId,
        blockId,
        destination: {
          container: "document",
          index: targetParent.index + offset,
        },
      };
    case "section":
    case "list":
      return {
        type: "move",
        documentId,
        blockId,
        destination: {
          container: targetParent.container,
          parentBlockId: targetParent.parentBlockId,
          index: targetParent.index + offset,
        },
      };
    case "columns":
      return {
        type: "move",
        documentId,
        blockId,
        destination: {
          container: "columns",
          parentBlockId: targetParent.parentBlockId,
          index: targetParent.index + offset,
          span: targetParent.span,
        },
      };
  }
}

export function applyBlockMove(
  doc: Document,
  update: MoveBlockUpdate
): Document {
  if (isMoveIntoOwnSubtree(doc, update.blockId, update.destination)) {
    return doc;
  }

  const source = findParentRef(doc, update.blockId);
  if (!source) return doc;

  const next: Document = {
    ...doc,
    layout: [...doc.layout],
    blocks: doc.blocks.map((block) => {
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
        case "spacer":
          return block;
      }
    }),
  };

  const blockById = new Map(next.blocks.map((block) => [block.id, block]));

  const removeFromSource = () => {
    switch (source.container) {
      case "document":
        next.layout.splice(source.index, 1);
        break;
      case "section": {
        const parent = blockById.get(source.parentBlockId);
        if (!parent || parent.type !== "section") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
      case "list": {
        const parent = blockById.get(source.parentBlockId);
        if (!parent || parent.type !== "list") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
      case "columns": {
        const parent = blockById.get(source.parentBlockId);
        if (!parent || parent.type !== "columns") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
    }
  };

  let destinationIndex = update.destination.index;
  if (
    sameContainer(source, update.destination) &&
    source.index < destinationIndex
  ) {
    destinationIndex -= 1;
  }

  removeFromSource();

  switch (update.destination.container) {
    case "document":
      next.layout.splice(
        clampIndex(destinationIndex, next.layout.length),
        0,
        update.blockId
      );
      break;
    case "section": {
      const parent = blockById.get(update.destination.parentBlockId);
      if (!parent || parent.type !== "section") return doc;
      parent.blocks.splice(
        clampIndex(destinationIndex, parent.blocks.length),
        0,
        update.blockId
      );
      break;
    }
    case "list": {
      const parent = blockById.get(update.destination.parentBlockId);
      if (!parent || parent.type !== "list") return doc;
      parent.blocks.splice(
        clampIndex(destinationIndex, parent.blocks.length),
        0,
        update.blockId
      );
      break;
    }
    case "columns": {
      const parent = blockById.get(update.destination.parentBlockId);
      if (!parent || parent.type !== "columns") return doc;
      parent.blocks.splice(
        clampIndex(destinationIndex, parent.blocks.length),
        0,
        {
          blockId: update.blockId,
          span: update.destination.span,
        }
      );
      break;
    }
  }

  return pruneStaleLayoutReferences(next);
}

function clampInsertIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

/**
 * Inserts `subtreeBlocks` (root first, then descendants; none may exist in
 * `doc.blocks` yet) and splices the root id into the destination container.
 */
export function applyInsertSubtreeAtDestination(
  doc: Document,
  subtreeBlocks: Document["blocks"][number][],
  destination: MoveBlockUpdate["destination"]
): Document | null {
  if (subtreeBlocks.length === 0) {
    return null;
  }
  const newRoot = subtreeBlocks[0];

  const next: Document = {
    ...doc,
    layout: [...doc.layout],
    blocks: doc.blocks.map((block) => {
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
        case "spacer":
          return block;
      }
    }),
  };

  for (const b of subtreeBlocks) {
    next.blocks.push(b);
  }

  const maxIndexForInsert = (() => {
    switch (destination.container) {
      case "document":
        return next.layout.length;
      case "section": {
        const p = next.blocks.find(
          (b): b is Extract<Document["blocks"][number], { type: "section" }> =>
            b.id === destination.parentBlockId && b.type === "section"
        );
        return p?.blocks.length ?? 0;
      }
      case "list": {
        const p = next.blocks.find(
          (b): b is Extract<Document["blocks"][number], { type: "list" }> =>
            b.id === destination.parentBlockId && b.type === "list"
        );
        return p?.blocks.length ?? 0;
      }
      case "columns": {
        const p = next.blocks.find(
          (b): b is Extract<Document["blocks"][number], { type: "columns" }> =>
            b.id === destination.parentBlockId && b.type === "columns"
        );
        return p?.blocks.length ?? 0;
      }
    }
  })();

  const idx = clampInsertIndex(destination.index, maxIndexForInsert);

  switch (destination.container) {
    case "document":
      next.layout.splice(idx, 0, newRoot.id);
      break;
    case "section": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "section"
      );
      if (!parent || parent.type !== "section") return null;
      parent.blocks.splice(idx, 0, newRoot.id);
      break;
    }
    case "list": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "list"
      );
      if (!parent || parent.type !== "list") return null;
      parent.blocks.splice(idx, 0, newRoot.id);
      break;
    }
    case "columns": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "columns"
      );
      if (!parent || parent.type !== "columns") return null;
      parent.blocks.splice(idx, 0, {
        blockId: newRoot.id,
        span: destination.span,
      });
      break;
    }
  }

  return pruneStaleLayoutReferences(next);
}

/** Inserts a new block row and splices its id into the destination container (no move/remove). */
export function applyInsertNewBlockAtDestination(
  doc: Document,
  newBlock: Document["blocks"][number],
  destination: MoveBlockUpdate["destination"]
): Document {
  const result = applyInsertSubtreeAtDestination(doc, [newBlock], destination);
  return result ?? doc;
}

/**
 * Removes `blockId` and every nested block referenced beneath it from `doc`,
 * and removes the root reference from its parent container.
 */
export function deleteBlockFromDocument(
  doc: Document,
  blockId: string
): Document | null {
  const source = findParentRef(doc, blockId);
  if (!source) {
    return null;
  }

  const blockById = new Map(doc.blocks.map((block) => [block.id, block]));
  if (!blockById.get(blockId)) {
    return null;
  }

  const toRemove = new Set<string>();
  collectSubtreeIdsInto(doc.blocks, blockId, toRemove);

  const next: Document = {
    ...doc,
    layout: [...doc.layout],
    blocks: doc.blocks.map((block) => {
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
        case "spacer":
          return block;
      }
    }),
  };

  const nextBlockById = new Map(next.blocks.map((block) => [block.id, block]));

  const removeFromSource = () => {
    switch (source.container) {
      case "document":
        next.layout.splice(source.index, 1);
        break;
      case "section": {
        const parent = nextBlockById.get(source.parentBlockId);
        if (!parent || parent.type !== "section") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
      case "list": {
        const parent = nextBlockById.get(source.parentBlockId);
        if (!parent || parent.type !== "list") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
      case "columns": {
        const parent = nextBlockById.get(source.parentBlockId);
        if (!parent || parent.type !== "columns") return;
        parent.blocks.splice(source.index, 1);
        break;
      }
    }
  };

  removeFromSource();

  next.blocks = next.blocks.filter((block) => !toRemove.has(block.id));

  return pruneStaleLayoutReferences(next);
}

/** Deep-copies the subtree at `blockId` with fresh ids and inserts it below that block. Omits `ref` on duplicated rows (same as paste). */
export function duplicateBlockBelowInDocument(
  doc: Document,
  blockId: string
): { document: Document; newRootId: string } | null {
  const parentRef = findParentRef(doc, blockId);
  if (!parentRef) {
    return null;
  }

  const blockById = new Map(doc.blocks.map((block) => [block.id, block]));
  if (!blockById.get(blockId)) {
    return null;
  }

  const orderedIds: string[] = [];
  const collect = (id: string) => {
    orderedIds.push(id);
    const block = blockById.get(id);
    if (!block) return;
    for (const childId of getChildBlockIds(block)) {
      collect(childId);
    }
  };
  collect(blockId);

  const oldToNew = new Map<string, string>();
  for (const id of orderedIds) {
    const block = blockById.get(id);
    if (!block) continue;
    oldToNew.set(id, createClientIdForDuplicate(block.type));
  }

  const remapId = (id: string) => oldToNew.get(id) ?? id;

  const newBlocks: Document["blocks"] = orderedIds.map((id) => {
    const b = blockById.get(id)!;
    switch (b.type) {
      case "text": {
        const { ref: _omitRef, ...rest } = b;
        void _omitRef;
        return {
          ...rest,
          id: remapId(b.id),
        };
      }
      case "spacer": {
        const { ref: _omitRef, ...rest } = b;
        void _omitRef;
        return {
          ...rest,
          id: remapId(b.id),
        };
      }
      case "section":
      case "list": {
        const { ref: _omitRef, ...rest } = b;
        void _omitRef;
        return {
          ...rest,
          id: remapId(b.id),
          blocks: b.blocks.map((cid) => remapId(cid)),
        };
      }
      case "columns": {
        const { ref: _omitRef, ...rest } = b;
        void _omitRef;
        return {
          ...rest,
          id: remapId(b.id),
          blocks: b.blocks.map((c) => ({
            ...c,
            blockId: remapId(c.blockId),
          })),
        };
      }
    }
  });

  const next: Document = {
    ...doc,
    layout: [...doc.layout],
    blocks: [
      ...doc.blocks.map((block) => {
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
          case "spacer":
            return block;
        }
      }),
      ...newBlocks,
    ],
  };

  const newRootId = remapId(blockId);
  const insertIndex = parentRef.index + 1;

  const nextBlockById = new Map(next.blocks.map((block) => [block.id, block]));

  switch (parentRef.container) {
    case "document":
      next.layout.splice(
        clampInsertIndex(insertIndex, next.layout.length),
        0,
        newRootId
      );
      break;
    case "section": {
      const parent = nextBlockById.get(parentRef.parentBlockId);
      if (!parent || parent.type !== "section") return null;
      parent.blocks.splice(
        clampInsertIndex(insertIndex, parent.blocks.length),
        0,
        newRootId
      );
      break;
    }
    case "list": {
      const parent = nextBlockById.get(parentRef.parentBlockId);
      if (!parent || parent.type !== "list") return null;
      parent.blocks.splice(
        clampInsertIndex(insertIndex, parent.blocks.length),
        0,
        newRootId
      );
      break;
    }
    case "columns": {
      const parent = nextBlockById.get(parentRef.parentBlockId);
      if (!parent || parent.type !== "columns") return null;
      parent.blocks.splice(
        clampInsertIndex(insertIndex, parent.blocks.length),
        0,
        {
          blockId: newRootId,
          span: parentRef.span,
        }
      );
      break;
    }
  }

  return {
    document: pruneStaleLayoutReferences(next),
    newRootId,
  };
}

/** Inserts `subtreeBlocks` (root first) immediately after `afterBlockId` in its parent container. */
export function insertSubtreeBelowInDocument(
  doc: Document,
  afterBlockId: string,
  subtreeBlocks: Document["blocks"][number][]
): Document | null {
  if (subtreeBlocks.length === 0) {
    return null;
  }
  const parentRef = findParentRef(doc, afterBlockId);
  if (!parentRef) {
    return null;
  }

  let destination: MoveBlockUpdate["destination"];
  switch (parentRef.container) {
    case "document":
      destination = {
        container: "document",
        index: parentRef.index + 1,
      };
      break;
    case "section":
      destination = {
        container: "section",
        parentBlockId: parentRef.parentBlockId,
        index: parentRef.index + 1,
      };
      break;
    case "list":
      destination = {
        container: "list",
        parentBlockId: parentRef.parentBlockId,
        index: parentRef.index + 1,
      };
      break;
    case "columns":
      destination = {
        container: "columns",
        parentBlockId: parentRef.parentBlockId,
        index: parentRef.index + 1,
        span: parentRef.span,
      };
      break;
  }

  return applyInsertSubtreeAtDestination(doc, subtreeBlocks, destination);
}

/** Inserts `newBlock` (not yet in `doc.blocks`) immediately after `afterBlockId` in its parent container. */
export function insertBlockBelowInDocument(
  doc: Document,
  afterBlockId: string,
  newBlock: Document["blocks"][number]
): Document | null {
  return insertSubtreeBelowInDocument(doc, afterBlockId, [newBlock]);
}
