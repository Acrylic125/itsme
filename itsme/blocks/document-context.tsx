"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";
import z from "zod";
import {
  DocumentSchema,
  renderDocumentLayout,
  RenderedLayoutBlock,
} from "./renderer";
import type { Block } from "./blocks";
import { BlockUpdateSchema } from "./updater";
import {
  applyBlockMove,
  isMoveIntoOwnSubtree,
  isNestedInsideBlock,
  type MoveBlockUpdate,
} from "./apply-block-move";
import { BlockTree, BlockTreeReorderBoundingBox, Pos } from "./renderer-types";
import { nanoid } from "nanoid";
import { useTRPCClient } from "@/server/utils";

export type DocumentId = string;

export type Document = z.infer<typeof DocumentSchema>;

export type DocumentWithId = Document & { id: DocumentId };

export type BlockUpdate = z.infer<typeof BlockUpdateSchema>;
type UpdateDocumentBlocksInput = {
  blocks: (
    | { type: "create" | "update"; block: Block }
    | { type: "delete"; blockId: string }
  )[];
};
type BlockSyncAction = UpdateDocumentBlocksInput["blocks"][number];

function areBlocksEqual(a: Block, b: Block): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildDocumentBlockDiff(
  serverDocument: Document,
  document: Document
): UpdateDocumentBlocksInput["blocks"] {
  const serverBlocksById = new Map(serverDocument.blocks.map((b) => [b.id, b]));
  const blocksById = new Map(document.blocks.map((b) => [b.id, b]));

  const createOrUpdate: BlockSyncAction[] = [];
  for (const block of document.blocks) {
    const serverBlock = serverBlocksById.get(block.id);
    if (!serverBlock) {
      createOrUpdate.push({ type: "create", block });
      continue;
    }
    if (!areBlocksEqual(serverBlock, block)) {
      createOrUpdate.push({ type: "update", block });
    }
  }

  const deletes: BlockSyncAction[] = serverDocument.blocks
    .filter((serverBlock) => !blocksById.has(serverBlock.id))
    .map((serverBlock) => ({
      type: "delete" as const,
      blockId: serverBlock.id,
    }));

  return [...createOrUpdate, ...deletes];
}

function removeEmptyContainers(doc: Document): Document {
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

  let changed = false;
  while (true) {
    const emptyIds = new Set(
      next.blocks
        .filter(
          (block): block is Extract<Block, { type: "section" | "list" }> =>
            (block.type === "section" || block.type === "list") &&
            block.blocks.length === 0
        )
        .map((block) => block.id)
    );
    if (emptyIds.size === 0) break;
    changed = true;

    next.layout = next.layout.filter((id) => !emptyIds.has(id));
    next.blocks = next.blocks
      .filter((block) => !emptyIds.has(block.id))
      .map((block) => {
        switch (block.type) {
          case "section":
          case "list":
            return {
              ...block,
              blocks: block.blocks.filter((id) => !emptyIds.has(id)),
            };
          case "columns":
            return {
              ...block,
              blocks: block.blocks.filter(
                (child) => !emptyIds.has(child.blockId)
              ),
            };
          case "text":
            return block;
        }
      });
  }

  return changed ? next : doc;
}

function applyBlockUpdate(doc: Document, update: BlockUpdate): Document {
  switch (update.type) {
    case "move":
      return removeEmptyContainers(applyBlockMove(doc, update));
    case "columns_spans": {
      let changed = false;
      const blocks: Block[] = doc.blocks.map((b) => {
        if (b.id !== update.columnsBlockId || b.type !== "columns") {
          return b;
        }
        if (update.spans.length !== b.blocks.length) {
          return b;
        }
        changed = true;
        return {
          ...b,
          blocks: b.blocks.map((child, i) => ({
            ...child,
            span: update.spans[i]!,
          })),
        };
      });
      if (!changed) {
        return doc;
      }
      return removeEmptyContainers({ ...doc, blocks });
    }
    case "text":
      break;
  }

  let changed = false;
  const blocks: Block[] = doc.blocks.map((b) => {
    if (b.id !== update.blockId || b.type !== "text") {
      return b;
    }
    changed = true;
    return {
      ...b,
      text: update.text,
      align: update.align,
      style: update.style,
    };
  });

  if (!changed) {
    return doc;
  }

  return removeEmptyContainers({ ...doc, blocks });
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

function cloneDocument(doc: Document): Document {
  return {
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
}

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

function applyMoveUpdates(doc: Document, updates: MoveBlockUpdate[]): Document {
  return updates.reduce((acc, update) => applyBlockMove(acc, update), doc);
}

function buildMoveUpdatesForReorder(args: {
  document: Document;
  documentId: string;
  reorder: NonNullable<DocumentStoreState["reorder"]>;
  blockTree: BlockTree;
}): { updates: MoveBlockUpdate[]; nextDocument: Document } | null {
  const { document, documentId, reorder, blockTree } = args;
  const movingBlockId = reorder.current?.blockIds[0];
  if (!movingBlockId) {
    return null;
  }

  const targetBox = reorder.targetBlock;
  if (!targetBox) {
    return null;
  }

  const targetParent = findParentRef(document, targetBox.blockId);
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
    return {
      updates: [update],
      nextDocument: applyMoveUpdates(document, [update]),
    };
  }

  // Left/Right: insert into columns or wrap into new columns.
  if (targetParent.container === "columns") {
    const columnsBlock = document.blocks.find(
      (b): b is Extract<Document["blocks"][number], { type: "columns" }> =>
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
    return {
      updates: [update],
      nextDocument: applyMoveUpdates(document, [update]),
    };
  }

  if (
    movingBlockId === targetBox.blockId ||
    isNestedInsideBlock(document, movingBlockId, targetBox.blockId)
  ) {
    return null;
  }

  const next = cloneDocument(document);
  const sourceParent = findParentRef(next, movingBlockId);
  let targetParentMutable = findParentRef(next, targetBox.blockId);
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
  targetParentMutable = findParentRef(next, targetBox.blockId);
  if (!targetParentMutable) {
    return null;
  }

  const newColumnsId =
    typeof nanoid === "function"
      ? `columns-${nanoid()}`
      : `columns-${Date.now()}`;
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

  const newColumnsBlock: Extract<
    Document["blocks"][number],
    { type: "columns" }
  > = {
    type: "columns",
    id: newColumnsId,
    blocks: orderedChildren,
  };
  next.blocks.push(newColumnsBlock);

  if (targetParentMutable.container === "document") {
    next.layout[targetParentMutable.index] = newColumnsId;
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
      parentBlock.blocks[targetParentMutable.index] = newColumnsId;
    } else if (
      targetParentMutable.container === "list" &&
      parentBlock.type === "list"
    ) {
      parentBlock.blocks[targetParentMutable.index] = newColumnsId;
    } else {
      return null;
    }
  }

  // Wrapping creates a columns block inline; document state is updated directly.
  return { updates: [], nextDocument: next };
}

export type DocumentStoreState = {
  documentId: DocumentId;
  document: Document;
  serverDocument: Document;
  focusBlockId: string | null;
  reorder: {
    current: {
      position: Pos;
      blockIds: string[];
    } | null;
    targetBlock: BlockTreeReorderBoundingBox | null;
  };
  update: (update: BlockUpdate) => void;
  focusBlock: (
    blockId: string | ((current: string | null) => string | null) | null
  ) => void;
  setReorderCurrent: (
    current: {
      position: Pos;
      blockIds: string[];
    } | null
  ) => void;
  setServerDocument: (document: Document) => void;
  setReorderTarget: (targetBlock: BlockTreeReorderBoundingBox | null) => void;
  commitReorder: (blockTree: BlockTree) => BlockUpdate[];
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore(
  documentId: DocumentId,
  initialDocument: Document
) {
  const initialServerDocument = cloneDocument(initialDocument);
  return createStore<DocumentStoreState>((set, get) => ({
    documentId,
    document: initialDocument,
    serverDocument: initialServerDocument,
    focusBlockId: null,
    reorder: {
      current: null,
      targetBlock: null,
    },
    focusBlock: (blockId) => {
      if (typeof blockId === "function") {
        set({ focusBlockId: blockId(get().focusBlockId) });
      } else {
        set({ focusBlockId: blockId });
      }
    },
    setReorderCurrent: (reorder) => {
      const current = get().reorder;
      set({
        reorder: {
          ...current,
          current:
            reorder == null
              ? null
              : {
                  ...current.current,
                  ...reorder,
                },
        },
      });
    },
    setServerDocument: (serverDocument) => {
      set({
        serverDocument: cloneDocument(serverDocument),
      });
    },
    setReorderTarget: (targetBlock) => {
      const current = get().reorder;
      if (!current) {
        return;
      }
      set({
        reorder: {
          ...current,
          targetBlock: targetBlock == null ? null : targetBlock,
        },
      });
    },
    commitReorder: (blockTree) => {
      const { documentId: activeId, document: doc, reorder } = get();
      if (!reorder) {
        return [];
      }
      const result = buildMoveUpdatesForReorder({
        document: doc,
        documentId: activeId,
        reorder,
        blockTree,
      });
      set({
        reorder: {
          current: null,
          targetBlock: null,
        },
      });
      if (!result) {
        return [];
      }
      const nextDocument = removeEmptyContainers(result.nextDocument);
      if (nextDocument !== doc) {
        set({
          documentId: activeId,
          document: nextDocument,
        });
      }
      return result.updates;
    },
    update: (update) => {
      const parsed = BlockUpdateSchema.safeParse(update);
      if (!parsed.success) {
        return;
      }
      const patch = parsed.data;
      const { documentId: activeId, document: doc } = get();
      if (patch.documentId !== activeId) {
        return;
      }
      const next = applyBlockUpdate(doc, patch);
      if (next === doc) {
        return;
      }
      set({
        documentId: activeId,
        document: next,
      });
    },
  }));
}

function documentPayloadFromWithId(doc: DocumentWithId): Document {
  const { id, ...rest } = doc;
  void id;
  return DocumentSchema.parse(rest);
}

type DocumentContextValue = {
  blocks: RenderedLayoutBlock[];
  blockTree: BlockTree;
  documentStore: DocumentStore;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentStoresProvider({
  document,
  children,
  dpi,
}: {
  document: DocumentWithId;
  children: ReactNode;
  dpi: number;
}) {
  const trpcClient = useTRPCClient();
  const [documentStore] = useState(() =>
    createDocumentStore(document.id, documentPayloadFromWithId(document))
  );
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isSyncingRef.current) {
        return;
      }
      const {
        document: currentDocument,
        serverDocument,
        setServerDocument,
      } = documentStore.getState();
      const blocks = buildDocumentBlockDiff(serverDocument, currentDocument);
      if (blocks.length === 0) {
        return;
      }
      isSyncingRef.current = true;
      trpcClient.resumes.updateDocumentBlocks
        .mutate({ blocks })
        .then(() => {
          setServerDocument(currentDocument);
        })
        .catch((error) => {
          // Keep serverDocument unchanged on failed sync; next loop retries.
          console.error("Failed to sync document blocks", error);
        })
        .finally(() => {
          isSyncingRef.current = false;
        });
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [documentStore, trpcClient]);

  const canMeasureText =
    typeof window !== "undefined" &&
    (typeof OffscreenCanvas !== "undefined" ||
      (!!window.document &&
        !!window.document.createElement("canvas").getContext("2d")));
  const renderedDocument = useStore(documentStore, (s) => s.document);
  const rendered = useMemo(() => {
    if (canMeasureText) {
      return renderDocumentLayout({ document: renderedDocument, dpi });
    }
    return {
      rendered: [],
      blockTree: new BlockTree(),
    };
  }, [renderedDocument, dpi, canMeasureText]);

  const value = useMemo<DocumentContextValue>(() => {
    return {
      blocks: rendered.rendered,
      blockTree: rendered.blockTree,
      documentStore,
    };
  }, [documentStore, rendered]);

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
  //   return createElement(DocumentStoresContext.Provider, { value }, children);
}

export function useDocument(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error("useDocument must be used within DocumentStoresProvider");
  }
  return ctx;
}

export function useDocumentStore<T>(selector: (s: DocumentStoreState) => T): T {
  const { documentStore } = useDocument();
  return useStore(documentStore, selector);
}
