"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createStore } from "zustand/vanilla";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import { useStore } from "zustand/react";
import z from "zod";
import {
  DocumentSchema,
  renderDocumentLayout,
  RenderedLayoutBlock,
} from "./renderer";
import type { Block } from "./blocks";
import { BlockUpdateSchema } from "./updater";
import { applyBlockMove } from "./apply-block-move";
import { BlockTree, BlockTreeReorderBoundingBox, Pos } from "./renderer-types";
import { MoveBlockUpdate } from "./apply-block-move";
import { nanoid } from "nanoid";

export type DocumentId = string;

export type Document = z.infer<typeof DocumentSchema>;

export type DocumentWithId = Document & { id: DocumentId };

export type BlockUpdate = z.infer<typeof BlockUpdateSchema>;

/** Key for deduping queue entries: one pending update per document + block pair. */
export function documentBlockUpdateKey(update: BlockUpdate): string {
  switch (update.type) {
    case "text":
    case "move":
      return `${update.documentId}:${update.blockId}`;
    case "columns_spans":
      return `${update.documentId}:${update.columnsBlockId}:columns_spans`;
    default: {
      const u: { type: string } = update;
      throw new Error(`Unhandled block update type: ${u.type}`);
    }
  }
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function getLocalStorage(): StateStorage {
  if (typeof window === "undefined") {
    return noopStorage;
  }
  return localStorage;
}

const DEFAULT_QUEUE_STORAGE_KEY = "itsme:document-update-queue";

const PersistedUpdatesRecordSchema = z.record(z.string(), BlockUpdateSchema);

function normalizePersistedUpdates(raw: unknown): Record<string, BlockUpdate> {
  const asRecord = PersistedUpdatesRecordSchema.safeParse(raw);
  if (asRecord.success) {
    const out: Record<string, BlockUpdate> = {};
    for (const [k, u] of Object.entries(asRecord.data)) {
      const r = BlockUpdateSchema.safeParse(u);
      if (r.success) {
        out[k] = r.data;
      }
    }
    return out;
  }
  const asArray = z.array(BlockUpdateSchema).safeParse(raw);
  if (asArray.success) {
    return Object.fromEntries(
      asArray.data.map((u) => [documentBlockUpdateKey(u), u])
    );
  }
  return {};
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
    return {
      updates: [update],
      nextDocument: applyMoveUpdates(document, [update]),
    };
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
    typeof nanoid === "function" ? `columns-${nanoid()}` : `columns-${Date.now()}`;
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

  // Wrapping requires creating a new columns block and cannot be represented
  // by existing MoveBlockUpdate alone; keep queue updates empty for now.
  return { updates: [], nextDocument: next };
}

export type DocumentUpdateQueueState = {
  updates: Record<string, BlockUpdate>;
  enqueue: (update: BlockUpdate) => void;
  setUpdates: (updates: Record<string, BlockUpdate>) => void;
};

export type DocumentUpdateQueueStore = ReturnType<
  typeof createDocumentUpdateQueueStore
>;

export function createDocumentUpdateQueueStore(options?: {
  storageKey?: string;
}) {
  const name = options?.storageKey ?? DEFAULT_QUEUE_STORAGE_KEY;

  return createStore(
    persist<
      DocumentUpdateQueueState,
      [],
      [],
      Pick<DocumentUpdateQueueState, "updates">
    >(
      (set, get) => ({
        updates: {},
        enqueue: (update) => {
          const key = documentBlockUpdateKey(update);
          set({
            ...get(),
            updates: { ...get().updates, [key]: update },
          });
        },
        setUpdates: (updates) =>
          set({
            ...get(),
            updates,
          }),
      }),
      {
        name,
        storage:
          createJSONStorage<Pick<DocumentUpdateQueueState, "updates">>(
            getLocalStorage
          ),
        partialize: (s): Pick<DocumentUpdateQueueState, "updates"> => ({
          updates: s.updates,
        }),
        merge: (persisted, current) => {
          if (persisted == null || typeof persisted !== "object") {
            return current;
          }
          const p = persisted as { updates?: unknown };
          return {
            ...current,
            updates: normalizePersistedUpdates(p.updates),
          };
        },
      }
    )
  );
}

export type DocumentStoreState = {
  documentId: DocumentId;
  document: Document;
  focusBlockId: string | null;
  reorder: {
    current: {
      position: Pos;
      blockIds: string[];
    } | null;
    targetBlock: BlockTreeReorderBoundingBox | null;
  };
  update: (queue: DocumentUpdateQueueStore, update: BlockUpdate) => void;
  focusBlock: (
    blockId: string | ((current: string | null) => string | null) | null
  ) => void;
  setReorderCurrent: (
    current: {
      position: Pos;
      blockIds: string[];
    } | null
  ) => void;
  setReorderTarget: (targetBlock: BlockTreeReorderBoundingBox | null) => void;
  commitReorder: (
    queue: DocumentUpdateQueueStore,
    blockTree: BlockTree
  ) => BlockUpdate[];
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore(
  documentId: DocumentId,
  initialDocument: Document
) {
  return createStore<DocumentStoreState>((set, get) => ({
    documentId,
    document: initialDocument,
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
    commitReorder: (queue, blockTree) => {
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
      for (const update of result.updates) {
        queue.getState().enqueue(update);
      }
      return result.updates;
    },
    update: (queue, update) => {
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
      queue.getState().enqueue(patch);
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
  updateQueueStore: DocumentUpdateQueueStore;
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
  const [stores] = useState(() => {
    const documentStore = createDocumentStore(
      document.id,
      documentPayloadFromWithId(document)
    );
    return {
      documentStore,
      updateQueueStore: createDocumentUpdateQueueStore(),
    };
  });

  const canMeasureText =
    typeof window !== "undefined" &&
    (typeof OffscreenCanvas !== "undefined" ||
      (!!window.document &&
        !!window.document.createElement("canvas").getContext("2d")));
  const renderedDocument = useStore(stores.documentStore, (s) => s.document);
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
      documentStore: stores.documentStore,
      updateQueueStore: stores.updateQueueStore,
    };
  }, [stores, rendered]);

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

export function useDocumentUpdateQueueStore<T>(
  selector: (s: DocumentUpdateQueueState) => T
): T {
  const { updateQueueStore } = useDocument();
  return useStore(updateQueueStore, selector);
}
