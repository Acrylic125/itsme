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
import {
  collectSubtreeBlocksInDocumentOrder,
  insertSubtreeBelowInDocument,
  sanitizeRootLayout,
} from "./apply-block-move";
import type { Block } from "./blocks";
import {
  parseCopyPasteClipboardPayload,
  serializeCopyPasteClipboard,
} from "./copy-paste-clipboard";
import { BlockUpdateSchema } from "./updater";
import { BlockTree, BlockTreeReorderBoundingBox, Pos } from "./renderer-types";
import { useQueryWithStatus } from "@/components/convex-hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_STYLE_SHEET, PAGE_SIZE, StyleSheetSchema } from "./blocks";
import { Loader2 } from "lucide-react";

export type DocumentId = string;

type StyleSheet = z.infer<typeof StyleSheetSchema>;
export type DocumentTextPresetKey = keyof StyleSheet["text"];

function applyTextStylePatchListToStyleSheet(
  styleSheet: StyleSheet,
  patches: Array<{
    style: DocumentTextPresetKey;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
  }>
): StyleSheet {
  const text = { ...styleSheet.text };
  for (const p of patches) {
    text[p.style] = {
      ...text[p.style],
      ...(p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
      ...(p.fontWeight !== undefined ? { fontWeight: p.fontWeight } : {}),
    };
  }
  return { ...styleSheet, text };
}

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

/** Session-local bidirectional map: client-generated ids ↔ Convex block ids. */
export type ClientIdMappings = {
  clientToConvex: Map<string, string>;
  convexToClient: Map<string, string>;
};

function createEmptyClientIdMappings(): ClientIdMappings {
  return {
    clientToConvex: new Map(),
    convexToClient: new Map(),
  };
}

function mergeClientIdMappingRecord(
  prev: ClientIdMappings,
  record: Record<string, string>
): ClientIdMappings {
  const clientToConvex = new Map(prev.clientToConvex);
  const convexToClient = new Map(prev.convexToClient);
  for (const [clientId, convexId] of Object.entries(record)) {
    if (!isClientId(clientId)) continue;
    clientToConvex.set(clientId, convexId);
    convexToClient.set(convexId, clientId);
  }
  return { clientToConvex, convexToClient };
}

/** Replace ids using `remap(id)`; unknown ids stay unchanged. */
function remapSnapshotIds(
  snapshot: DocumentBlocksSnapshot,
  remap: (id: string) => string
): DocumentBlocksSnapshot {
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

/** Convex → client ids for display and for diffing against local snapshots. */
function snapshotConvexToClient(
  snapshot: DocumentBlocksSnapshot,
  convexToClient: Map<string, string>
): DocumentBlocksSnapshot {
  if (convexToClient.size === 0) return snapshot;
  return remapSnapshotIds(snapshot, (id) => convexToClient.get(id) ?? id);
}

function mapBlockIdForMutation(
  id: string,
  clientToConvex: Map<string, string>
): string {
  if (isClientId(id)) {
    return clientToConvex.get(id) ?? id;
  }
  return id;
}

function remapConvexBlockRowData(
  data: ConvexBlockRowData,
  clientToConvex: Map<string, string>
): ConvexBlockRowData {
  const m = (id: string) => mapBlockIdForMutation(id, clientToConvex);
  switch (data.type) {
    case "text":
      return {
        ...data,
        ref: data.ref ? m(data.ref) : undefined,
      };
    case "section":
      return {
        ...data,
        children: data.children.map(m),
        ref: data.ref ? m(data.ref) : undefined,
      };
    case "columns":
      return {
        ...data,
        children: data.children.map((c) => ({
          ...c,
          blockId: m(c.blockId),
        })),
        ref: data.ref ? m(data.ref) : undefined,
      };
    case "list":
      return {
        ...data,
        children: data.children.map(m),
        ref: data.ref ? m(data.ref) : undefined,
      };
  }
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
      fontSize?: number;
      fontWeight?: "normal" | "bold";
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
        ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}),
        ...(block.fontWeight !== undefined
          ? { fontWeight: block.fontWeight }
          : {}),
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
  actions: BlockSyncAction[],
  clientToConvex: Map<string, string>
): UpdateDocumentBlocksAction[] {
  const out: UpdateDocumentBlocksAction[] = [];
  for (const action of actions) {
    if (action.type === "delete") {
      out.push({
        type: "delete",
        blockId: mapBlockIdForMutation(
          action.blockId,
          clientToConvex
        ) as Id<"blocks">,
      });
      continue;
    }
    const data = remapConvexBlockRowData(
      clientBlockToConvexData(action.block),
      clientToConvex
    );
    if (action.type === "create") {
      out.push({
        type: "create",
        ...(isClientId(action.block.id) ? { clientId: action.block.id } : {}),
        data,
      });
    } else {
      out.push({
        type: "update",
        blockId: mapBlockIdForMutation(
          action.block.id,
          clientToConvex
        ) as Id<"blocks">,
        data,
      });
    }
  }
  return out;
}

/**
 * The single in-flight user interaction with the document.
 *
 * At any moment the user is doing exactly one of: editing a block, selecting a
 * block without editing (text blocks only), moving a block (drag in flight),
 * placing a new block, or resizing a column.
 * These are mutually exclusive, so they share one slot rather than living as
 * parallel fields.
 */
export type DocumentStoreAction =
  | {
      type: "edit-block";
      blockId: string;
    }
  | {
      /** Text blocks: selected (focus ring) but textarea not open yet. */
      type: "focus-block";
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
      /** Place clipboard block (validated JSON) using the same targets as add-block. */
      type: "paste-block";
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

export type DocumentStoreFocusBlockAction = Extract<
  DocumentStoreAction,
  { type: "focus-block" }
>;

export type DocumentStoreMoveBlockAction = Extract<
  DocumentStoreAction,
  { type: "move-block" }
>;

export type DocumentStoreAddBlockAction = Extract<
  DocumentStoreAction,
  { type: "add-block" }
>;

export type DocumentStorePasteBlockAction = Extract<
  DocumentStoreAction,
  { type: "paste-block" }
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
  /** Bidirectional client id ↔ Convex block id for this session (this document). */
  clientIdMappings: ClientIdMappings;
  mergeClientIdMappings: (record: Record<string, string>) => void;
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore() {
  return createStore<DocumentStoreState>((set) => ({
    action: null,
    setAction: (input) => {
      set((state) => {
        const next = typeof input === "function" ? input(state.action) : input;
        return { action: next };
      });
    },
    clientIdMappings: createEmptyClientIdMappings(),
    mergeClientIdMappings: (record) => {
      set((state) => ({
        clientIdMappings: mergeClientIdMappingRecord(
          state.clientIdMappings,
          record
        ),
      }));
    },
  }));
}

export function asEditBlockAction(
  action: DocumentStoreAction | null
): DocumentStoreEditBlockAction | null {
  return action?.type === "edit-block" ? action : null;
}

export function asFocusBlockAction(
  action: DocumentStoreAction | null
): DocumentStoreFocusBlockAction | null {
  return action?.type === "focus-block" ? action : null;
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

export function asPasteBlockAction(
  action: DocumentStoreAction | null
): DocumentStorePasteBlockAction | null {
  return action?.type === "paste-block" ? action : null;
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

export function selectPasteBlockAction(
  state: DocumentStoreState
): DocumentStorePasteBlockAction | null {
  return asPasteBlockAction(state.action);
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
    case "focus-block":
      return action.blockId;
    case "move-block":
      return action.current.blockIds[0] ?? null;
    case "resize-column":
      return action.blockId;
    case "add-block":
    case "paste-block":
      return null;
  }
}

type DocumentContextValue = {
  blocks: RenderedLayoutBlock[];
  blockTree: BlockTree;
  documentStore: DocumentStore;
  document: z.infer<typeof DocumentSchema> | null;
  /** Convex project id when the provider was given one; otherwise null. */
  projectId: Id<"projects"> | null;
  /** Apply a pure transform to the current blocks snapshot; changes debounce then sync to Convex. */
  updateBlocks: (
    transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot
  ) => void;
  /** Writes toolbar font size/weight onto this document's shared text preset (explicit action). */
  syncDocumentTextPresetToMatch: (args: {
    style: DocumentTextPresetKey;
    fontSize: number;
    fontWeight: "normal" | "bold";
  }) => Promise<void>;
  /** Same for every document in the project; no-op when `projectId` is null. */
  syncProjectTextPresetToMatch: (args: {
    style: DocumentTextPresetKey;
    fontSize: number;
    fontWeight: "normal" | "bold";
  }) => Promise<void>;
  dpi: number;
};

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentStoresProvider({
  documentId,
  projectId: projectIdProp,
  children,
  dpi,
}: {
  documentId: string;
  /** When set, enables “sync all documents in project” text-style actions. */
  projectId?: string | null;
  children: ReactNode;
  dpi: number;
}) {
  const [documentStore] = useState(() => createDocumentStore());

  const convexDocumentId = documentId as Id<"documents">;
  const convexProjectId =
    projectIdProp != null && projectIdProp !== ""
      ? (projectIdProp as Id<"projects">)
      : null;

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

  const updateDocumentTextStylesMutation = useMutation(
    api.documentTasks.updateDocumentTextStyles
  );

  const syncProjectTextStylePresetAllDocumentsMutation = useMutation(
    api.documentTasks.syncProjectTextStylePresetAllDocuments
  );

  const [modifiedBlocks, setModifiedBlocks] =
    useState<DocumentBlocksSnapshot | null>(null);
  const modifiedBlocksRef = useRef<DocumentBlocksSnapshot | null>(null);
  /** Latest Convex payload (always real ids). */
  const blocksQueryRawRef = useRef<NonNullable<
    (typeof blocksQuery)["data"]
  > | null>(null);
  const commitTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const inFlightCommitRef = useRef<Promise<unknown> | null>(null);
  const pendingCommitRef = useRef(false);

  const clientIdMappings = useStore(documentStore, (s) => s.clientIdMappings);

  useEffect(() => {
    modifiedBlocksRef.current = modifiedBlocks;
  }, [modifiedBlocks]);

  useEffect(() => {
    if (blocksQuery.status === "success" && blocksQuery.data) {
      blocksQueryRawRef.current = blocksQuery.data;
    }
  }, [blocksQuery.status, blocksQuery.data]);

  const commitModifiedBlocksRef = useRef<(() => void) | null>(null);

  const commitModifiedBlocks = useCallback(() => {
    const modified = modifiedBlocksRef.current;
    const rawServer = blocksQueryRawRef.current;
    if (!modified || !rawServer) {
      return;
    }

    if (inFlightCommitRef.current) {
      pendingCommitRef.current = true;
      return;
    }

    const { clientToConvex, convexToClient } =
      documentStore.getState().clientIdMappings;
    const serverNormalized = snapshotConvexToClient(rawServer, convexToClient);

    const serverDoc = toDiffDocument(serverNormalized);
    const modifiedDoc = toDiffDocument(modified);
    const blockActions = buildDocumentBlockDiff(serverDoc, modifiedDoc);
    const mutationActions = blockSyncActionsToMutationActions(
      blockActions,
      clientToConvex
    );
    const layoutPatch = layoutPatchIfChanged(
      serverNormalized.layout,
      modified.layout
    );
    const layoutForMutation =
      layoutPatch !== undefined
        ? (layoutPatch.map((id) =>
            mapBlockIdForMutation(id, clientToConvex)
          ) as Id<"blocks">[])
        : undefined;

    if (mutationActions.length === 0 && layoutForMutation === undefined) {
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

    const promise = run({
      documentId: convexDocumentId,
      actions: mutationActions,
      ...(layoutForMutation !== undefined ? { layout: layoutForMutation } : {}),
    })
      .then((result) => {
        const maybe = result as {
          clientIdToBlockId?: Record<string, string>;
        } | null;
        const next = maybe?.clientIdToBlockId;
        if (next && Object.keys(next).length > 0) {
          documentStore.getState().mergeClientIdMappings(next);
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
  }, [convexDocumentId, documentStore, updateDocumentBlocksMutation]);

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

  const syncDocumentTextPresetToMatch = useCallback(
    async (args: {
      style: DocumentTextPresetKey;
      fontSize: number;
      fontWeight: "normal" | "bold";
    }) => {
      const run = updateDocumentTextStylesMutation.withOptimisticUpdate(
        (localStore, mutationArgs) => {
          const current = localStore.getQuery(
            api.documentTasks.getDocumentStyles,
            {
              documentId: mutationArgs.documentId,
            }
          );
          if (current === undefined) return;
          localStore.setQuery(
            api.documentTasks.getDocumentStyles,
            { documentId: mutationArgs.documentId },
            {
              ...current,
              styleSheet: applyTextStylePatchListToStyleSheet(
                current.styleSheet,
                mutationArgs.patches
              ),
            }
          );
        }
      );

      await run({
        documentId: convexDocumentId,
        patches: [
          {
            style: args.style,
            fontSize: args.fontSize,
            fontWeight: args.fontWeight,
          },
        ],
      });
    },
    [convexDocumentId, updateDocumentTextStylesMutation]
  );

  const syncProjectTextPresetToMatch = useCallback(
    async (args: {
      style: DocumentTextPresetKey;
      fontSize: number;
      fontWeight: "normal" | "bold";
    }) => {
      if (!convexProjectId) {
        return;
      }
      await syncProjectTextStylePresetAllDocumentsMutation({
        projectId: convexProjectId,
        style: args.style,
        fontSize: args.fontSize,
        fontWeight: args.fontWeight,
      });
    },
    [convexProjectId, syncProjectTextStylePresetAllDocumentsMutation]
  );

  const updateBlocks = useCallback(
    (
      transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot
    ) => {
      setModifiedBlocks((prev) => {
        const raw = blocksQueryRawRef.current;
        if (!raw) {
          return prev;
        }

        const { convexToClient } = documentStore.getState().clientIdMappings;
        const normalized = snapshotConvexToClient(raw, convexToClient);
        const base: DocumentBlocksSnapshot = prev
          ? prev
          : structuredClone(normalized);
        return transform(base);
      });

      scheduleCommit();
    },
    [documentStore, scheduleCommit]
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

    const raw = blocksQuery.data as NonNullable<typeof blocksQuery.data>;
    const normalizedServer = snapshotConvexToClient(
      raw,
      clientIdMappings.convexToClient
    );
    const source = modifiedBlocks ?? normalizedServer;

    const cleaned = sanitizeRootLayout({
      name: source.document.name,
      pageSize: PAGE_SIZE,
      styleSheet: stylesQuery.data.styleSheet,
      blocks: source.blocks,
      layout: source.layout,
    });

    return {
      id: source.document.id,
      name: cleaned.name,
      blocks: cleaned.blocks,
      layout: cleaned.layout,
      styleSheet: cleaned.styleSheet,
      pageSize: cleaned.pageSize,
    };
  }, [blocksQuery, modifiedBlocks, stylesQuery, clientIdMappings]);

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
      projectId: convexProjectId,
      updateBlocks,
      syncDocumentTextPresetToMatch,
      syncProjectTextPresetToMatch,
      dpi,
    };
  }, [
    rendered,
    dpi,
    renderedDocument,
    documentStore,
    convexProjectId,
    updateBlocks,
    syncDocumentTextPresetToMatch,
    syncProjectTextPresetToMatch,
  ]);

  useEffect(() => {
    if (!renderedDocument) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      if (target.isContentEditable) {
        return true;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        return;
      }
      if (isEditableTarget(e.target)) {
        return;
      }

      const key = e.key;
      if (key === "c" || key === "C") {
        const action = documentStore.getState().action;
        const focusId =
          action?.type === "edit-block" || action?.type === "focus-block"
            ? action.blockId
            : null;
        if (!focusId) {
          return;
        }
        const subtree = collectSubtreeBlocksInDocumentOrder(
          renderedDocument,
          focusId
        );
        if (!subtree?.length) {
          return;
        }
        e.preventDefault();
        void navigator.clipboard
          .writeText(serializeCopyPasteClipboard(subtree))
          .catch(() => {});
        return;
      }

      if (key === "v" || key === "V") {
        e.preventDefault();
        void (async () => {
          let text: string;
          try {
            text = await navigator.clipboard.readText();
          } catch {
            return;
          }
          const remapped = parseCopyPasteClipboardPayload(text);
          if (!remapped?.length) {
            return;
          }

          const action = documentStore.getState().action;
          const focusId =
            action?.type === "edit-block" || action?.type === "focus-block"
              ? action.blockId
              : null;

          if (focusId) {
            updateBlocks((current) => {
              const doc = documentBlocksSnapshotToDocument(current);
              const next = insertSubtreeBelowInDocument(doc, focusId, remapped);
              if (!next) {
                return current;
              }
              return {
                ...current,
                blocks: next.blocks,
                layout: next.layout as DocumentBlocksSnapshot["layout"],
              };
            });
            if (remapped[0]!.type === "text") {
              documentStore.getState().setAction({
                type: "edit-block",
                blockId: remapped[0]!.id,
              });
            } else {
              documentStore.getState().setAction(null);
            }
          } else {
            documentStore.getState().setAction({
              type: "paste-block",
              current: null,
              targetBlock: null,
            });
          }
        })();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [renderedDocument, documentStore, updateBlocks]);

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
