"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand/react";
import z from "zod";
import { DocumentSchema, type RenderedLayoutBlock } from "./renderer";
import { BlockUpdateSchema } from "./updater";
import { BlockTree } from "./renderer-types";
import { useQueryWithStatus } from "@/components/convex-hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import {
  createDocumentStore,
  documentActionOf,
  selectActiveBlockId,
  selectFocusBlockId,
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
import { documentBlocksSnapshotToDocument } from "./core/persistence/snapshot";
import type { DocumentBlocksSnapshot } from "./core/persistence/snapshot";
import { useDocumentBlocksSync } from "./hooks/use-document-blocks-sync";
import { useDocumentSaveGuard } from "./hooks/use-document-save-guard";
import { useDocumentKeyboardShortcuts } from "./hooks/use-document-keyboard-shortcuts";
import { useDocumentRenderModel } from "./hooks/use-document-render-model";
import { useDocumentTextPresets } from "./hooks/use-document-text-presets";
import { makeProjDocId } from "./session-store";
import { StyleSheetSchema } from "./blocks";

export {
  createDocumentStore,
  documentActionOf,
  documentBlocksSnapshotToDocument,
  selectActiveBlockId,
  selectFocusBlockId,
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
export type Document = z.infer<typeof DocumentSchema>;
export type DocumentWithId = Document & { id: DocumentId };
export type BlockUpdate = z.infer<typeof BlockUpdateSchema>;
export type DocumentTextPresetKey = keyof z.infer<
  typeof StyleSheetSchema
>["text"];

type DocumentContextValue = {
  blocks: RenderedLayoutBlock[];
  blockTree: BlockTree;
  documentStore: DocumentStore;
  document: DocumentWithId | null;
  masterDocument: DocumentWithId | null;
  masterDocumentId: DocumentId | null;
  projectId: Id<"projects"> | null;
  updateBlocks: ReturnType<typeof useDocumentBlocksSync>["updateBlocks"];
  syncDocumentTextPresetToMatch: ReturnType<
    typeof useDocumentTextPresets
  >["syncDocumentTextPresetToMatch"];
  syncProjectTextPresetToMatch: ReturnType<
    typeof useDocumentTextPresets
  >["syncProjectTextPresetToMatch"];
  isSaving: boolean;
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

  const clientIdMappings = useStore(documentStore, (s) => s.clientIdMappings);

  const projDocId = useMemo(
    () =>
      makeProjDocId(
        convexProjectId ? String(convexProjectId) : null,
        documentId
      ),
    [convexProjectId, documentId]
  );

  const { modifiedBlocks, updateBlocks, isSaving } = useDocumentBlocksSync({
    documentStore,
    convexDocumentId,
    projDocId,
    blocksQueryData:
      blocksQuery.status === "success" ? blocksQuery.data : undefined,
  });

  const { syncDocumentTextPresetToMatch, syncProjectTextPresetToMatch } =
    useDocumentTextPresets({
      convexDocumentId,
      convexProjectId,
      projDocId,
      styleSheet:
        stylesQuery.status === "success"
          ? stylesQuery.data.styleSheet
          : undefined,
    });

  const { renderedDocument, masterDocument, rendered } = useDocumentRenderModel(
    {
      dpi,
      blocksQueryData:
        blocksQuery.status === "success" ? blocksQuery.data : undefined,
      blocksQueryReady: blocksQuery.status === "success",
      stylesQueryReady: stylesQuery.status === "success",
      styleSheet:
        stylesQuery.status === "success"
          ? stylesQuery.data.styleSheet
          : undefined,
      modifiedBlocks,
      clientIdMappings,
      masterDocumentId,
      convexDocumentId,
      masterBlocksQueryData:
        masterBlocksQuery.status === "success"
          ? masterBlocksQuery.data
          : undefined,
      masterBlocksQueryReady: masterBlocksQuery.status === "success",
      masterStylesQueryReady: masterStylesQuery.status === "success",
      masterStyleSheet:
        masterStylesQuery.status === "success"
          ? masterStylesQuery.data.styleSheet
          : undefined,
    }
  );

  useDocumentKeyboardShortcuts({
    renderedDocument,
    documentStore,
    projDocId,
  });

  useDocumentSaveGuard(isSaving);

  const value = useMemo<DocumentContextValue>(
    () => ({
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
      isSaving,
      dpi,
    }),
    [
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
      isSaving,
    ]
  );

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
