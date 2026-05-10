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
import { BlockTree, BlockTreeReorderBoundingBox, Pos } from "./renderer-types";
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

const CLIENT_ID_PREFIX = "CLIENT_ID:" as const;

function isClientId(id: string): boolean {
  return id.startsWith(CLIENT_ID_PREFIX);
}

function reconcileSnapshotClientIds(
  snapshot: DocumentBlocksSnapshot,
  mapping: Map<string, string>
): DocumentBlocksSnapshot {
  if (mapping.size === 0) return snapshot;

  const remap = (id: string): string => mapping.get(id) ?? id;

  return {
    ...snapshot,
    layout: snapshot.layout.map((id) => remap(id)) as Id<"blocks">[],
    blocks: snapshot.blocks.map((block) => {
      const id = remap(block.id);
      const ref = block.ref ? remap(block.ref) : undefined;
      switch (block.type) {
        case "text":
          return { ...block, id, ...(ref ? { ref } : {}) };
        case "section":
        case "list":
          return {
            ...block,
            id,
            blocks: block.blocks.map((childId) => remap(childId)),
            ...(ref ? { ref } : {}),
          };
        case "columns":
          return {
            ...block,
            id,
            blocks: block.blocks.map((child) => ({
              ...child,
              blockId: remap(child.blockId),
            })),
            ...(ref ? { ref } : {}),
          };
      }
    }),
    document: {
      ...snapshot.document,
      id: remap(snapshot.document.id) as Id<"documents">,
    },
  };
}

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

export function documentBlocksSnapshotToDocument(
  snapshot: DocumentBlocksSnapshot
): Document {
  return {
    name: snapshot.document.name,
    pageSize: PAGE_SIZE,
    styleSheet: DEFAULT_STYLE_SHEET,
    blocks: snapshot.blocks,
    layout: snapshot.layout,
  };
}

function toDiffDocument(snapshot: DocumentBlocksSnapshot): Document {
  return documentBlocksSnapshotToDocument(snapshot);
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
      ref?: string;
    }
  | {
      type: "section";
      children: string[];
      ref?: string;
    }
  | {
      type: "columns";
      children: { span: number; blockId: string }[];
      ref?: string;
    }
  | {
      type: "list";
      children: string[];
      bulletType: "normal" | "alphabetical" | "numerical";
      bulletValue?: string;
      leftSpace?: number;
      rightSpace?: number;
      ref?: string;
    };

function clientBlockToConvexData(block: Block): ConvexBlockRowData {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: block.text,
        align: block.align,
        style: block.style,
        ref: block.ref ? block.ref : undefined,
      };
    case "section":
      return {
        type: "section",
        children: block.blocks,
        ref: block.ref ? block.ref : undefined,
      };
    case "columns":
      return {
        type: "columns",
        children: block.blocks.map((c) => ({
          span: c.span,
          blockId: c.blockId,
        })),
        ref: block.ref ? block.ref : undefined,
      };
    case "list": {
      const bullet = block.bullet;
      if (bullet.type === "normal") {
        return {
          type: "list",
          children: block.blocks,
          bulletType: "normal" as const,
          bulletValue: bullet.value,
          leftSpace: block.leftSpace,
          rightSpace: block.rightSpace,
          ref: block.ref ? block.ref : undefined,
        };
      }
      return {
        type: "list",
        children: block.blocks,
        bulletType: bullet.type,
        leftSpace: block.leftSpace,
        rightSpace: block.rightSpace,
        ref: block.ref ? block.ref : undefined,
      };
    }
    default: {
      const _x: never = block;
      return _x;
    }
  }
}

type UpdateDocumentBlocksAction =
  | { type: "create"; clientId?: string; data: ConvexBlockRowData }
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
      out.push({
        type: "create",
        ...(isClientId(action.block.id) ? { clientId: action.block.id } : {}),
        data,
      });
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

/**
 * The single in-flight user interaction with the document.
 *
 * At any moment the user is doing exactly one of: editing a block (focused),
 * moving a block (drag in flight), placing a new block, or resizing a column.
 * These are mutually exclusive, so they share one slot rather than living as
 * parallel fields.
 */
export type DocumentStoreAction =
  | {
      type: "edit-block";
      blockId: string;
    }
  | {
      type: "move-block";
      current: {
        position: Pos;
        blockIds: string[];
      };
      targetBlock: BlockTreeReorderBoundingBox | null;
    }
  | {
      type: "add-block";
      blockType: "text" | "list";
      current: {
        position: Pos;
      } | null;
      targetBlock: BlockTreeReorderBoundingBox | null;
    }
  | {
      /**
       * Drag-resize on a column-child boundary. Distinct from `move-block`
       * because the gesture starts on the same block but should never trigger
       * reorder targets / layout reflow.
       */
      type: "resize-column";
      /** Direct child block being dragged. */
      blockId: string;
      /** Parent columns block id. */
      columnsBlockId: string;
      childIndex: number;
      siblingCount: number;
      /** Which boundary of `blockId` is being dragged. */
      kind: "left" | "right";
      /** Inner width of the columns row in canvas px (matches resize context). */
      columnRowWidthPx: number;
      /** Pointer position at drag start (canvas coords). */
      pointerStart: Pos;
      /** Current pointer position (canvas coords). */
      pointerCurrent: Pos;
    };

export type DocumentStoreEditBlockAction = Extract<
  DocumentStoreAction,
  { type: "edit-block" }
>;

export type DocumentStoreMoveBlockAction = Extract<
  DocumentStoreAction,
  { type: "move-block" }
>;

export type DocumentStoreAddBlockAction = Extract<
  DocumentStoreAction,
  { type: "add-block" }
>;

export type DocumentStoreResizeColumnAction = Extract<
  DocumentStoreAction,
  { type: "resize-column" }
>;

export type DocumentStoreState = {
  action: DocumentStoreAction | null;
  setAction: (
    action:
      | DocumentStoreAction
      | null
      | ((current: DocumentStoreAction | null) => DocumentStoreAction | null)
  ) => void;
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore() {
  return createStore<DocumentStoreState>((set, get) => ({
    action: null,
    setAction: (input) => {
      if (typeof input === "function") {
        set({ action: input(get().action) });
      } else {
        set({ action: input });
      }
    },
  }));
}

export function asEditBlockAction(
  action: DocumentStoreAction | null
): DocumentStoreEditBlockAction | null {
  return action?.type === "edit-block" ? action : null;
}

export function asMoveBlockAction(
  action: DocumentStoreAction | null
): DocumentStoreMoveBlockAction | null {
  return action?.type === "move-block" ? action : null;
}

export function asAddBlockAction(
  action: DocumentStoreAction | null
): DocumentStoreAddBlockAction | null {
  return action?.type === "add-block" ? action : null;
}

export function asResizeColumnAction(
  action: DocumentStoreAction | null
): DocumentStoreResizeColumnAction | null {
  return action?.type === "resize-column" ? action : null;
}

export function selectEditBlockAction(
  state: DocumentStoreState
): DocumentStoreEditBlockAction | null {
  return asEditBlockAction(state.action);
}

export function selectMoveBlockAction(
  state: DocumentStoreState
): DocumentStoreMoveBlockAction | null {
  return asMoveBlockAction(state.action);
}

export function selectAddBlockAction(
  state: DocumentStoreState
): DocumentStoreAddBlockAction | null {
  return asAddBlockAction(state.action);
}

export function selectResizeColumnAction(
  state: DocumentStoreState
): DocumentStoreResizeColumnAction | null {
  return asResizeColumnAction(state.action);
}

/** Block id currently being edited, or null when no edit is in flight. */
export function selectFocusBlockId(state: DocumentStoreState): string | null {
  return selectEditBlockAction(state)?.blockId ?? null;
}

/**
 * Block id the user is currently interacting with — the block being edited
 * for `edit-block`, the block being dragged for `move-block`, or the column
 * child whose boundary is being dragged for `resize-column`. Used by sibling
 * blocks to decide whether they can still respond to input.
 *
 * Distinct from `selectFocusBlockId`, which is purely about the editing
 * focus / focus ring and is null during a drag.
 */
export function selectActiveBlockId(state: DocumentStoreState): string | null {
  const action = state.action;
  if (!action) return null;
  switch (action.type) {
    case "edit-block":
      return action.blockId;
    case "move-block":
      return action.current.blockIds[0] ?? null;
    case "resize-column":
      return action.blockId;
    case "add-block":
      return null;
  }
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
  const [documentStore] = useState(() => createDocumentStore());

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
  const inFlightCommitRef = useRef<Promise<unknown> | null>(null);
  const pendingCommitRef = useRef(false);
  const clientIdToBlockIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    modifiedBlocksRef.current = modifiedBlocks;
  }, [modifiedBlocks]);

  useEffect(() => {
    if (blocksQuery.status === "success" && blocksQuery.data) {
      blocksQueryDataRef.current = blocksQuery.data;
    }
  }, [blocksQuery.status, blocksQuery.data]);

  const commitModifiedBlocksRef = useRef<(() => void) | null>(null);

  const commitModifiedBlocks = useCallback(() => {
    const modified = modifiedBlocksRef.current;
    const server = blocksQueryDataRef.current;
    if (!modified || !server) {
      return;
    }

    // Serialize commits so we can reconcile client ids (CLIENT_ID:...) as soon as
    // the server responds with real ids, before computing the next diff.
    if (inFlightCommitRef.current) {
      pendingCommitRef.current = true;
      return;
    }

    const mapping = clientIdToBlockIdRef.current;
    const reconciledModified = reconcileSnapshotClientIds(modified, mapping);

    const serverDoc = toDiffDocument(server);
    const modifiedDoc = toDiffDocument(reconciledModified);
    const blockActions = buildDocumentBlockDiff(serverDoc, modifiedDoc);
    const mutationActions = blockSyncActionsToMutationActions(blockActions);
    const layoutPatch = layoutPatchIfChanged(
      server.layout,
      reconciledModified.layout
    );

    if (mutationActions.length === 0 && layoutPatch === undefined) {
      setModifiedBlocks(null);
      return;
    }

    const optimisticSnapshot = structuredClone(reconciledModified);

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

    const promise = run({
      documentId: convexDocumentId,
      actions: mutationActions,
      ...(layoutPatch !== undefined ? { layout: layoutPatch } : {}),
    })
      .then((result) => {
        // If the server returns client-id mappings, persist them so the next
        // debounced commit will use real ids.
        const maybe = result as {
          clientIdToBlockId?: Record<string, string>;
        } | null;
        const next = maybe?.clientIdToBlockId;
        if (next) {
          for (const [clientId, blockId] of Object.entries(next)) {
            if (isClientId(clientId)) {
              clientIdToBlockIdRef.current.set(clientId, blockId);
            }
          }
        }
      })
      .catch((error) => {
        console.error("Failed to update document blocks", error);
      })
      .finally(() => {
        inFlightCommitRef.current = null;
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          commitModifiedBlocksRef.current?.();
        }
      });
    inFlightCommitRef.current = promise;

    setModifiedBlocks(null);
  }, [convexDocumentId, updateDocumentBlocksMutation]);

  useEffect(() => {
    commitModifiedBlocksRef.current = commitModifiedBlocks;
  }, [commitModifiedBlocks]);

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
    (
      transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot
    ) => {
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
