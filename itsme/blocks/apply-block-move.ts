import z from "zod";
import { DocumentSchema } from "./renderer";
import type { DropZone } from "@/components/block-dnd-context";

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
  const documentIndex = doc.layout.indexOf(childBlockId);
  if (documentIndex >= 0) {
    return { container: "document", index: documentIndex };
  }

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
        const index = block.blocks.findIndex((child) => child.blockId === childBlockId);
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

  return null;
}

function sameContainer(a: ParentRef, b: MoveBlockUpdate["destination"]): boolean {
  if (a.container !== b.container) return false;
  if (a.container === "document") return true;
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

  if (
    dropZone.type !== "column-insert" &&
    dropZone.targetBlockId === blockId
  ) {
    return null;
  }

  if (dropZone.type === "column-insert") {
    const columnsBlock = document.blocks.find(
      (block): block is Extract<Document["blocks"][number], { type: "columns" }> =>
        block.id === dropZone.targetBlockId && block.type === "columns"
    );
    if (!columnsBlock) return null;

    const insertIndex = Number(dropZone.id.split(":").at(-1));
    if (!Number.isFinite(insertIndex)) return null;

    const span = columnsBlock.blocks.reduce((sum, child) => sum + child.span, 0) || 1;

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

export function applyBlockMove(doc: Document, update: MoveBlockUpdate): Document {
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
  if (sameContainer(source, update.destination) && source.index < destinationIndex) {
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

  return next;
}
