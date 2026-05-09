"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
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
import { useQueryWithStatus } from "@/components/convex-hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_STYLE_SHEET, PAGE_SIZE } from "./blocks";
import { Loader2 } from "lucide-react";

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

/** Snapshot shape returned by `documentTasks.getDocumentBlocks`. */
export type DocumentBlocksSnapshot = {
  document: { id: Id<"documents">; name: string };
  layout: Id<"blocks">[];
  blocks: Block[];
};

function toDiffDocument(snapshot: DocumentBlocksSnapshot): Document {
  return {
    name: snapshot.document.name,
    pageSize: PAGE_SIZE,
    styleSheet: DEFAULT_STYLE_SHEET,
    blocks: snapshot.blocks,
    layout: snapshot.layout,
  };
}

function layoutPatchIfChanged(
  serverLayout: Id<"blocks">[],
  modifiedLayout: Id<"blocks">[]
): Id<"blocks">[] | undefined {
  if (serverLayout.length !== modifiedLayout.length) {
    return modifiedLayout as Id<"blocks">[];
  }
  for (let i = 0; i < serverLayout.length; i++) {
    if (serverLayout[i] !== modifiedLayout[i]) {
      return modifiedLayout as Id<"blocks">[];
    }
  }
  return undefined;
}

/** Row `data` shape for `blocks` table — matches Convex `blockDataValidator`. */
type ConvexBlockRowData =
  | {
      type: "text";
      text: string;
      align: "left" | "center" | "right";
      style: "default" | "h1" | "h2" | "h3";
      ref?: Id<"blocks">;
    }
  | {
      type: "section";
      children: Id<"blocks">[];
      ref?: Id<"blocks">;
    }
  | {
      type: "columns";
      children: { span: number; blockId: Id<"blocks"> }[];
      ref?: Id<"blocks">;
    }
  | {
      type: "list";
      children: Id<"blocks">[];
      bulletType: "normal" | "alphabetical" | "numerical";
      bulletValue?: string;
      leftSpace?: number;
      rightSpace?: number;
      ref?: Id<"blocks">;
    };

function clientBlockToConvexData(block: Block): ConvexBlockRowData {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: block.text,
        align: block.align,
        style: block.style,
        ref: block.ref ? (block.ref as Id<"blocks">) : undefined,
      };
    case "section":
      return {
        type: "section",
        children: block.blocks.map((id) => id as Id<"blocks">),
        ref: block.ref ? (block.ref as Id<"blocks">) : undefined,
      };
    case "columns":
      return {
        type: "columns",
        children: block.blocks.map((c) => ({
          span: c.span,
          blockId: c.blockId as Id<"blocks">,
        })),
        ref: block.ref ? (block.ref as Id<"blocks">) : undefined,
      };
    case "list": {
      const bullet = block.bullet;
      if (bullet.type === "normal") {
        return {
          type: "list",
          children: block.blocks.map((id) => id as Id<"blocks">),
          bulletType: "normal" as const,
          bulletValue: bullet.value,
          leftSpace: block.leftSpace,
          rightSpace: block.rightSpace,
          ref: block.ref ? (block.ref as Id<"blocks">) : undefined,
        };
      }
      return {
        type: "list",
        children: block.blocks.map((id) => id as Id<"blocks">),
        bulletType: bullet.type,
        leftSpace: block.leftSpace,
        rightSpace: block.rightSpace,
        ref: block.ref ? (block.ref as Id<"blocks">) : undefined,
      };
    }
    default: {
      const _x: never = block;
      return _x;
    }
  }
}

type UpdateDocumentBlocksAction =
  | { type: "create"; data: ConvexBlockRowData }
  | { type: "update"; blockId: Id<"blocks">; data: ConvexBlockRowData }
  | { type: "delete"; blockId: Id<"blocks"> };

function blockSyncActionsToMutationActions(
  actions: BlockSyncAction[]
): UpdateDocumentBlocksAction[] {
  const out: UpdateDocumentBlocksAction[] = [];
  for (const action of actions) {
    if (action.type === "delete") {
      out.push({
        type: "delete",
        blockId: action.blockId as Id<"blocks">,
      });
      continue;
    }
    const data = clientBlockToConvexData(action.block);
    if (action.type === "create") {
      out.push({ type: "create", data });
    } else {
      out.push({
        type: "update",
        blockId: action.block.id as Id<"blocks">,
        data,
      });
    }
  }
  return out;
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

export function buildMoveUpdatesForReorder(args: {
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
  focusBlockId: string | null;
  reorder: {
    current: {
      position: Pos;
      blockIds: string[];
    } | null;
    targetBlock: BlockTreeReorderBoundingBox | null;
  };
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
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore() {
  // documentId: DocumentId,
  // initialDocument: Document
  return createStore<DocumentStoreState>((set, get) => ({
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
    // commitReorder: (blockTree) => {
    //   const { documentId: activeId, document: doc, reorder } = get();
    //   if (!reorder) {
    //     return [];
    //   }
    //   const result = buildMoveUpdatesForReorder({
    //     document: doc,
    //     documentId: activeId,
    //     reorder,
    //     blockTree,
    //   });
    //   set({
    //     reorder: {
    //       current: null,
    //       targetBlock: null,
    //     },
    //   });
    //   if (!result) {
    //     return [];
    //   }
    //   const nextDocument = removeEmptyContainers(result.nextDocument);
    //   if (nextDocument !== doc) {
    //     set({
    //       documentId: activeId,
    //       document: nextDocument,
    //     });
    //   }
    //   return result.updates;
    // },
    // update: (update) => {
    //   const parsed = BlockUpdateSchema.safeParse(update);
    //   if (!parsed.success) {
    //     return;
    //   }
    //   const patch = parsed.data;
    //   const { documentId: activeId, document: doc } = get();
    //   if (patch.documentId !== activeId) {
    //     return;
    //   }
    //   const next = applyBlockUpdate(doc, patch);
    //   if (next === doc) {
    //     return;
    //   }
    //   set({
    //     documentId: activeId,
    //     document: next,
    //   });
    // },
  }));
}

type DocumentContextValue = {
  blocks: RenderedLayoutBlock[];
  blockTree: BlockTree;
  documentStore: DocumentStore;
  document: z.infer<typeof DocumentSchema> | null;
  /** Apply a pure transform to the current blocks snapshot; changes debounce then sync to Convex. */
  updateBlocks: (
    transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot
  ) => void;
  dpi: number;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentStoresProvider({
  documentId,
  children,
  dpi,
}: {
  documentId: string;
  children: ReactNode;
  dpi: number;
}) {
  // const trpcClient = useTRPCClient();
  const [documentStore] = useState(() => createDocumentStore());
  // const isSyncingRef = useRef(false);

  // useEffect(() => {
  //   const interval = window.setInterval(() => {
  //     if (isSyncingRef.current) {
  //       return;
  //     }
  //     const {
  //       document: currentDocument,
  //       serverDocument,
  //       setServerDocument,
  //     } = documentStore.getState();
  //     const blocks = buildDocumentBlockDiff(serverDocument, currentDocument);
  //     if (blocks.length === 0) {
  //       return;
  //     }
  //     isSyncingRef.current = true;
  //     trpcClient.resumes.updateDocumentBlocks
  //       .mutate({ blocks })
  //       .then(() => {
  //         setServerDocument(currentDocument);
  //       })
  //       .catch((error) => {
  //         // Keep serverDocument unchanged on failed sync; next loop retries.
  //         console.error("Failed to sync document blocks", error);
  //       })
  //       .finally(() => {
  //         isSyncingRef.current = false;
  //       });
  //   }, 500);

  //   return () => {
  //     window.clearInterval(interval);
  //   };
  // }, [documentStore, trpcClient]);

  const convexDocumentId = documentId as Id<"documents">;

  const blocksQuery = useQueryWithStatus(
    api.documentTasks.getDocumentBlocks,
    documentId ? { documentId: convexDocumentId } : "skip"
  );

  const stylesQuery = useQueryWithStatus(
    api.documentTasks.getDocumentStyles,
    documentId ? { documentId: convexDocumentId } : "skip"
  );

  const updateDocumentBlocksMutation = useMutation(
    api.documentTasks.updateDocumentBlocks
  );

  const [modifiedBlocks, setModifiedBlocks] =
    useState<DocumentBlocksSnapshot | null>(null);
  const modifiedBlocksRef = useRef<DocumentBlocksSnapshot | null>(null);
  const blocksQueryDataRef = useRef<NonNullable<
    (typeof blocksQuery)["data"]
  > | null>(null);
  const commitTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);

  useEffect(() => {
    modifiedBlocksRef.current = modifiedBlocks;
  }, [modifiedBlocks]);

  useEffect(() => {
    if (blocksQuery.status === "success" && blocksQuery.data) {
      blocksQueryDataRef.current = blocksQuery.data;
    }
  }, [blocksQuery.status, blocksQuery.data]);

  const commitModifiedBlocks = useCallback(() => {
    const modified = modifiedBlocksRef.current;
    const server = blocksQueryDataRef.current;
    if (!modified || !server) {
      return;
    }

    const serverDoc = toDiffDocument(server);
    const modifiedDoc = toDiffDocument(modified);
    const blockActions = buildDocumentBlockDiff(serverDoc, modifiedDoc);
    const mutationActions = blockSyncActionsToMutationActions(blockActions);
    const layoutPatch = layoutPatchIfChanged(server.layout, modified.layout);

    if (mutationActions.length === 0 && layoutPatch === undefined) {
      setModifiedBlocks(null);
      return;
    }

    const optimisticSnapshot = structuredClone(modified);

    const run = updateDocumentBlocksMutation.withOptimisticUpdate(
      (localStore) => {
        const current = localStore.getQuery(
          api.documentTasks.getDocumentBlocks,
          {
            documentId: convexDocumentId,
          }
        );
        if (current !== undefined) {
          localStore.setQuery(
            api.documentTasks.getDocumentBlocks,
            { documentId: convexDocumentId },
            optimisticSnapshot
          );
        }
      }
    );

    void run({
      documentId: convexDocumentId,
      actions: mutationActions,
      ...(layoutPatch !== undefined ? { layout: layoutPatch } : {}),
    }).catch((error) => {
      console.error("Failed to update document blocks", error);
    });

    setModifiedBlocks(null);
  }, [convexDocumentId, updateDocumentBlocksMutation]);

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current !== null) {
      globalThis.clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = globalThis.setTimeout(() => {
      commitTimerRef.current = null;
      commitModifiedBlocks();
    }, 1000);
  }, [commitModifiedBlocks]);

  const updateBlocks = useCallback(
    (transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot) => {
      setModifiedBlocks((prev) => {
        const queryData = blocksQueryDataRef.current;
        if (!queryData) {
          return prev;
        }

        const base: DocumentBlocksSnapshot = prev
          ? prev
          : structuredClone(queryData);
        return transform(base);
      });

      scheduleCommit();
    },
    [scheduleCommit]
  );

  useEffect(() => {
    return () => {
      if (commitTimerRef.current !== null) {
        globalThis.clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  const renderedDocument = useMemo(() => {
    if (blocksQuery.status !== "success" || stylesQuery.status !== "success") {
      return null;
    }

    const source =
      modifiedBlocks ??
      (blocksQuery.data as NonNullable<typeof blocksQuery.data>);

    return {
      id: source.document.id,
      name: source.document.name,
      blocks: source.blocks,
      layout: source.layout,
      styleSheet: stylesQuery.data.styleSheet,
      pageSize: PAGE_SIZE,
    };
  }, [blocksQuery, modifiedBlocks, stylesQuery.status, stylesQuery.data]);

  const canMeasureText =
    typeof window !== "undefined" &&
    (typeof OffscreenCanvas !== "undefined" ||
      (!!window.document &&
        !!window.document.createElement("canvas").getContext("2d")));
  const rendered = useMemo(() => {
    if (canMeasureText && renderedDocument) {
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
      document: renderedDocument,
      updateBlocks,
      dpi,
    };
  }, [rendered, dpi, renderedDocument, documentStore, updateBlocks]);

  const isLoading =
    blocksQuery.status === "pending" || stylesQuery.status === "pending";
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

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
