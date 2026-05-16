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
import { useStore } from "zustand/react";
import z from "zod";
import {
  DocumentSchema,
  renderDocumentLayout,
  RenderedLayoutBlock,
} from "./renderer";
import { collectSubtreeBlocksInDocumentOrder } from "./core/graph";
import { sanitizeRootLayout } from "./core/graph";
import type { Block } from "./blocks";
import {
  parseCopyPasteClipboardPayload,
  serializeCopyPasteClipboard,
} from "./copy-paste-clipboard";
import { BlockUpdateSchema } from "./updater";
import {
  makeProjDocId,
  pushHistoryOp,
  redoHistory,
  undoHistory,
} from "./session-store";
import { BlockTree } from "./renderer-types";
import { useQueryWithStatus } from "@/components/convex-hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_STYLE_SHEET, PAGE_SIZE, StyleSheetSchema } from "./blocks";
import { Loader2 } from "lucide-react";
import { isClientId } from "./core/client-ids";
import {
  clientBlockToConvexData,
  remapConvexBlockRowData,
  type ConvexBlockRowData,
} from "./core/persistence/convex-codec";
import {
  documentBlocksSnapshotToDocument,
  mapBlockIdForMutation,
  snapshotConvexToClient,
  type DocumentBlocksSnapshot,
} from "./core/persistence/snapshot";
import {
  asAddBlockAction,
  asEditBlockAction,
  asFocusBlockAction,
  asMoveBlockAction,
  asPasteBlockAction,
  asResizeColumnAction,
  createDocumentStore,
  selectActiveBlockId,
  selectAddBlockAction,
  selectEditBlockAction,
  selectFocusBlockId,
  selectMoveBlockAction,
  selectPasteBlockAction,
  selectResizeColumnAction,
  type ClientIdMappings,
  type DocumentStore,
  type DocumentStoreAction,
  type DocumentStoreAddBlockAction,
  type DocumentStoreEditBlockAction,
  type DocumentStoreFocusBlockAction,
  type DocumentStoreMoveBlockAction,
  type DocumentStorePasteBlockAction,
  type DocumentStoreResizeColumnAction,
  type DocumentStoreState,
} from "./core/document-store";

export {
  asAddBlockAction,
  asEditBlockAction,
  asFocusBlockAction,
  asMoveBlockAction,
  asPasteBlockAction,
  asResizeColumnAction,
  createDocumentStore,
  documentBlocksSnapshotToDocument,
  selectActiveBlockId,
  selectAddBlockAction,
  selectEditBlockAction,
  selectFocusBlockId,
  selectMoveBlockAction,
  selectPasteBlockAction,
  selectResizeColumnAction,
  type ClientIdMappings,
  type DocumentBlocksSnapshot,
  type DocumentStore,
  type DocumentStoreAction,
  type DocumentStoreAddBlockAction,
  type DocumentStoreEditBlockAction,
  type DocumentStoreFocusBlockAction,
  type DocumentStoreMoveBlockAction,
  type DocumentStorePasteBlockAction,
  type DocumentStoreResizeColumnAction,
  type DocumentStoreState,
};

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
      (id) => mapBlockIdForMutation(id, clientToConvex)
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

type DocumentContextValue = {
  blocks: RenderedLayoutBlock[];
  blockTree: BlockTree;
  documentStore: DocumentStore;
  document: DocumentWithId | null;
  masterDocument: DocumentWithId | null;
  masterDocumentId: DocumentId | null;
  /** Convex project id when the provider was given one; otherwise null. */
  projectId: Id<"projects"> | null;
  /** Apply a pure transform to the current blocks snapshot; changes debounce then sync to Convex. */
  updateBlocks: (
    transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot,
    options?: { down?: () => void }
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

  const projectDocumentsQuery = useQueryWithStatus(
    api.documentTasks.getProjectDocuments,
    convexProjectId ? { projectId: convexProjectId } : "skip"
  );

  const stylesQuery = useQueryWithStatus(
    api.documentTasks.getDocumentStyles,
    documentId ? { documentId: convexDocumentId } : "skip"
  );

  const masterDocumentId =
    projectDocumentsQuery.status === "success"
      ? (projectDocumentsQuery.data.masterDocumentId ?? null)
      : null;
  const shouldLoadSeparateMasterDocument =
    masterDocumentId !== null && masterDocumentId !== convexDocumentId;

  const masterBlocksQuery = useQueryWithStatus(
    api.documentTasks.getDocumentBlocks,
    shouldLoadSeparateMasterDocument ? { documentId: masterDocumentId } : "skip"
  );

  const masterStylesQuery = useQueryWithStatus(
    api.documentTasks.getDocumentStyles,
    shouldLoadSeparateMasterDocument ? { documentId: masterDocumentId } : "skip"
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
  /** When true, `updateBlocks` applies transforms without recording session undo history. */
  const suppressHistoryForBlocksTransformRef = useRef(false);

  const clientIdMappings = useStore(documentStore, (s) => s.clientIdMappings);

  useEffect(() => {
    modifiedBlocksRef.current = modifiedBlocks;
  }, [modifiedBlocks]);

  const setModifiedBlocksState = useCallback(
    (next: DocumentBlocksSnapshot | null) => {
      modifiedBlocksRef.current = next;
      setModifiedBlocks(next);
    },
    []
  );

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
      setModifiedBlocksState(null);
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

    setModifiedBlocksState(null);
  }, [
    convexDocumentId,
    documentStore,
    setModifiedBlocksState,
    updateDocumentBlocksMutation,
  ]);

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

  const projDocId = useMemo(
    () =>
      makeProjDocId(
        convexProjectId ? String(convexProjectId) : null,
        documentId
      ),
    [convexProjectId, documentId]
  );

  const applyBlocksTransform = useCallback(
    (
      transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot
    ) => {
      const raw = blocksQueryRawRef.current;
      if (!raw) {
        return;
      }

      const { convexToClient } = documentStore.getState().clientIdMappings;
      const normalized = snapshotConvexToClient(raw, convexToClient);
      const base = modifiedBlocksRef.current
        ? structuredClone(modifiedBlocksRef.current)
        : structuredClone(normalized);
      const next = transform(base);

      setModifiedBlocksState(next);

      scheduleCommit();
    },
    [documentStore, scheduleCommit, setModifiedBlocksState]
  );

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

      const sheet = stylesQuery.data?.styleSheet;
      const prev =
        sheet?.text[args.style] ?? DEFAULT_STYLE_SHEET.text[args.style];

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

      if (sheet) {
        pushHistoryOp(projDocId, {
          down: () => {
            void run({
              documentId: convexDocumentId,
              patches: [
                {
                  style: args.style,
                  fontSize: prev.fontSize,
                  fontWeight: prev.fontWeight,
                },
              ],
            });
          },
          up: () => {
            void run({
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
        });
      }
    },
    [
      convexDocumentId,
      projDocId,
      stylesQuery.data?.styleSheet,
      updateDocumentTextStylesMutation,
    ]
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

      const sheet = stylesQuery.data?.styleSheet;
      const prev =
        sheet?.text[args.style] ?? DEFAULT_STYLE_SHEET.text[args.style];

      await syncProjectTextStylePresetAllDocumentsMutation({
        projectId: convexProjectId,
        style: args.style,
        fontSize: args.fontSize,
        fontWeight: args.fontWeight,
      });

      if (sheet) {
        pushHistoryOp(projDocId, {
          down: () => {
            void syncProjectTextStylePresetAllDocumentsMutation({
              projectId: convexProjectId,
              style: args.style,
              fontSize: prev.fontSize,
              fontWeight: prev.fontWeight,
            });
          },
          up: () => {
            void syncProjectTextStylePresetAllDocumentsMutation({
              projectId: convexProjectId,
              style: args.style,
              fontSize: args.fontSize,
              fontWeight: args.fontWeight,
            });
          },
        });
      }
    },
    [
      convexProjectId,
      projDocId,
      stylesQuery.data?.styleSheet,
      syncProjectTextStylePresetAllDocumentsMutation,
    ]
  );

  const updateBlocks = useCallback(
    (
      transform: (current: DocumentBlocksSnapshot) => DocumentBlocksSnapshot,
      options?: { down?: () => void }
    ) => {
      const historyDown = options?.down;
      const skipHistory = suppressHistoryForBlocksTransformRef.current;
      const raw = blocksQueryRawRef.current;
      if (!raw) {
        return;
      }

      const { convexToClient } = documentStore.getState().clientIdMappings;
      const normalized = snapshotConvexToClient(raw, convexToClient);
      const base = modifiedBlocksRef.current
        ? structuredClone(modifiedBlocksRef.current)
        : structuredClone(normalized);
      const next = transform(base);

      setModifiedBlocksState(next);

      scheduleCommit();

      if (historyDown && !skipHistory && next !== base) {
        pushHistoryOp(projDocId, {
          up: () => {
            suppressHistoryForBlocksTransformRef.current = true;
            try {
              applyBlocksTransform(transform);
            } finally {
              suppressHistoryForBlocksTransformRef.current = false;
            }
          },
          down: () => {
            suppressHistoryForBlocksTransformRef.current = true;
            try {
              historyDown();
            } finally {
              suppressHistoryForBlocksTransformRef.current = false;
            }
          },
        });
      }
    },
    [
      applyBlocksTransform,
      documentStore,
      projDocId,
      scheduleCommit,
      setModifiedBlocksState,
    ]
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

  const masterDocument = useMemo<DocumentWithId | null>(() => {
    if (masterDocumentId === null) {
      return null;
    }
    if (masterDocumentId === convexDocumentId) {
      return renderedDocument;
    }
    if (
      masterBlocksQuery.status !== "success" ||
      masterStylesQuery.status !== "success"
    ) {
      return null;
    }

    const source = masterBlocksQuery.data;
    const cleaned = sanitizeRootLayout({
      name: source.document.name,
      pageSize: PAGE_SIZE,
      styleSheet: masterStylesQuery.data.styleSheet,
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
  }, [
    convexDocumentId,
    masterBlocksQuery,
    masterDocumentId,
    masterStylesQuery,
    renderedDocument,
  ]);

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
      masterDocument,
      masterDocumentId,
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
    masterDocument,
    masterDocumentId,
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

          documentStore.getState().setAction({
            type: "paste-block",
            current: null,
            targetBlock: null,
          });
        })();
        return;
      }

      if (key === "z" || key === "Z") {
        if (e.shiftKey) {
          return;
        }
        e.preventDefault();
        undoHistory(projDocId);
        return;
      }

      if (key === "y" || key === "Y") {
        e.preventDefault();
        redoHistory(projDocId);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [renderedDocument, documentStore, updateBlocks, projDocId]);

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
