import z from "zod";
import { DocumentSchema } from "./renderer";

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

type ParentRef =
  | {
      container: "document";
      index: number;
    }
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

function findParentRef(doc: Document, childBlockId: string): ParentRef | null {
  // Prefer nested parents over `layout`. If a block is still listed in `layout`
  // but also sits under a section/list/columns (stale state), removing only
  // from layout would leave a duplicate reference under the nested parent.
  for (const block of doc.blocks) {
    switch (block.type) {
      case "section": {
        const index = block.blocks.indexOf(childBlockId);
        if (index >= 0) {
          return {
            container: "section",
            parentBlockId: block.id,
            index,
          };
        }
        break;
      }
      case "list": {
        const index = block.blocks.indexOf(childBlockId);
        if (index >= 0) {
          return {
            container: "list",
            parentBlockId: block.id,
            index,
          };
        }
        break;
      }
      case "columns": {
        const index = block.blocks.findIndex(
          (child) => child.blockId === childBlockId
        );
        if (index >= 0) {
          return {
            container: "columns",
            parentBlockId: block.id,
            index,
            span: block.blocks[index].span,
          };
        }
        break;
      }
      case "text":
        break;
    }
  }

  const documentIndex = doc.layout.indexOf(childBlockId);
  if (documentIndex >= 0) {
    return { container: "document", index: documentIndex };
  }

  return null;
}

/**
 * Drops layout entries for ids that already appear as children of
 * section/list/columns. That inconsistent state can happen after races or older
 * bugs; it makes moves think the parent is `document` and leave a duplicate
 * reference under a nested parent.
 */
export function pruneStaleLayoutReferences(doc: Document): Document {
  const nestedChildIds = new Set<string>();
  for (const block of doc.blocks) {
    switch (block.type) {
      case "section":
      case "list":
        for (const id of block.blocks) {
          nestedChildIds.add(id);
        }
        break;
      case "columns":
        for (const c of block.blocks) {
          nestedChildIds.add(c.blockId);
        }
        break;
      case "text":
        break;
    }
  }
  if (nestedChildIds.size === 0) {
    return doc;
  }
  const nextLayout = doc.layout.filter((id) => !nestedChildIds.has(id));
  if (nextLayout.length === doc.layout.length) {
    return doc;
  }
  return { ...doc, layout: nextLayout };
}

function getChildBlockIds(block: Document["blocks"][number]): string[] {
  switch (block.type) {
    case "section":
    case "list":
      return block.blocks;
    case "columns":
      return block.blocks.map((child) => child.blockId);
    case "text":
      return [];
  }
}

function isDescendantOf(
  doc: Document,
  possibleDescendantId: string,
  ancestorId: string
): boolean {
  const blockById = new Map(doc.blocks.map((block) => [block.id, block]));
  const visit = (blockId: string): boolean => {
    const block = blockById.get(blockId);
    if (!block) return false;
    for (const childBlockId of getChildBlockIds(block)) {
      if (childBlockId === possibleDescendantId) return true;
      if (visit(childBlockId)) return true;
    }
    return false;
  };

  return visit(ancestorId);
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

/** True if `descendantId` is strictly nested under `ancestorId` (not equal). */
export function isNestedInsideBlock(
  doc: Document,
  ancestorId: string,
  descendantId: string
): boolean {
  return isDescendantOf(doc, descendantId, ancestorId);
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

/** Inserts a new block row and splices its id into the destination container (no move/remove). */
export function applyInsertNewBlockAtDestination(
  doc: Document,
  newBlock: Document["blocks"][number],
  destination: MoveBlockUpdate["destination"]
): Document {
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
          return block;
      }
    }),
  };

  next.blocks.push(newBlock);

  const maxIndexForInsert = (() => {
    switch (destination.container) {
      case "document":
        return next.layout.length;
      case "section": {
        const p = next.blocks.find(
          (
            b
          ): b is Extract<
            Document["blocks"][number],
            { type: "section" }
          > =>
            b.id === destination.parentBlockId && b.type === "section"
        );
        return p?.blocks.length ?? 0;
      }
      case "list": {
        const p = next.blocks.find(
          (
            b
          ): b is Extract<Document["blocks"][number], { type: "list" }> =>
            b.id === destination.parentBlockId && b.type === "list"
        );
        return p?.blocks.length ?? 0;
      }
      case "columns": {
        const p = next.blocks.find(
          (
            b
          ): b is Extract<
            Document["blocks"][number],
            { type: "columns" }
          > =>
            b.id === destination.parentBlockId && b.type === "columns"
        );
        return p?.blocks.length ?? 0;
      }
    }
  })();

  const idx = clampInsertIndex(destination.index, maxIndexForInsert);

  switch (destination.container) {
    case "document":
      next.layout.splice(idx, 0, newBlock.id);
      break;
    case "section": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "section"
      );
      if (!parent || parent.type !== "section") return doc;
      parent.blocks.splice(idx, 0, newBlock.id);
      break;
    }
    case "list": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "list"
      );
      if (!parent || parent.type !== "list") return doc;
      parent.blocks.splice(idx, 0, newBlock.id);
      break;
    }
    case "columns": {
      const parent = next.blocks.find(
        (b) => b.id === destination.parentBlockId && b.type === "columns"
      );
      if (!parent || parent.type !== "columns") return doc;
      parent.blocks.splice(idx, 0, {
        blockId: newBlock.id,
        span: destination.span,
      });
      break;
    }
  }

  return next;
}
