"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildDocumentBlockDiff,
  blockSyncActionsToMutationActions,
  documentBlocksSnapshotToDocument,
  layoutPatchIfChanged,
  rebaseResurrectedSnapshotIds,
} from "../document-sync";
import {
  mapBlockIdForMutation,
  snapshotConvexToClient,
  type DocumentBlocksSnapshot,
} from "../core/persistence/snapshot";
import type { DocumentStore } from "../core/document-store";
import { pushHistoryOp, type ProjDocId } from "../session-store";

type BlocksQueryData = {
  document: { id: Id<"documents">; name: string };
  layout: Id<"blocks">[];
  blocks: DocumentBlocksSnapshot["blocks"];
};

export function useDocumentBlocksSync(args: {
  documentStore: DocumentStore;
  convexDocumentId: Id<"documents">;
  projDocId: ProjDocId;
  blocksQueryData: BlocksQueryData | undefined;
}) {
  const { documentStore, convexDocumentId, projDocId, blocksQueryData } = args;

  const updateDocumentBlocksMutation = useMutation(
    api.documentTasks.updateDocumentBlocks
  );

  const [modifiedBlocks, setModifiedBlocks] =
    useState<DocumentBlocksSnapshot | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const modifiedBlocksRef = useRef<DocumentBlocksSnapshot | null>(null);
  const blocksQueryRawRef = useRef<BlocksQueryData | null>(null);
  const commitTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const inFlightCommitRef = useRef<Promise<unknown> | null>(null);
  const pendingCommitRef = useRef(false);
  const suppressHistoryForBlocksTransformRef = useRef(false);

  useEffect(() => {
    modifiedBlocksRef.current = modifiedBlocks;
  }, [modifiedBlocks]);

  useEffect(() => {
    if (blocksQueryData) {
      blocksQueryRawRef.current = blocksQueryData;
    }
  }, [blocksQueryData]);

  const refreshIsSaving = useCallback(() => {
    setIsSaving(
      modifiedBlocksRef.current !== null ||
        commitTimerRef.current !== null ||
        inFlightCommitRef.current !== null ||
        pendingCommitRef.current
    );
  }, []);

  const setModifiedBlocksState = useCallback(
    (next: DocumentBlocksSnapshot | null) => {
      modifiedBlocksRef.current = next;
      setModifiedBlocks(next);
      refreshIsSaving();
    },
    [refreshIsSaving]
  );

  const commitModifiedBlocksRef = useRef<(() => void) | null>(null);

  const commitModifiedBlocks = useCallback(() => {
    const modified = modifiedBlocksRef.current;
    const rawServer = blocksQueryRawRef.current;
    if (!modified || !rawServer) {
      return;
    }

    if (inFlightCommitRef.current) {
      pendingCommitRef.current = true;
      refreshIsSaving();
      return;
    }

    const { clientToConvex, convexToClient } =
      documentStore.getState().clientIdMappings;
    const serverNormalized = snapshotConvexToClient(rawServer, convexToClient);

    const serverDoc = documentBlocksSnapshotToDocument(serverNormalized);
    const rebasedModified = rebaseResurrectedSnapshotIds({
      serverDocument: serverDoc,
      snapshot: modified,
    });
    const modifiedDoc = documentBlocksSnapshotToDocument(rebasedModified);
    const blockActions = buildDocumentBlockDiff(serverDoc, modifiedDoc);
    const mutationActions = blockSyncActionsToMutationActions(
      blockActions,
      clientToConvex
    );
    const layoutPatch = layoutPatchIfChanged(
      serverNormalized.layout,
      rebasedModified.layout
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

    const optimisticSnapshot = structuredClone(rebasedModified);

    const run = updateDocumentBlocksMutation.withOptimisticUpdate(
      (localStore) => {
        const current = localStore.getQuery(
          api.documentTasks.getDocumentBlocks,
          { documentId: convexDocumentId }
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
        } else {
          refreshIsSaving();
        }
      });
    inFlightCommitRef.current = promise;
    refreshIsSaving();

    setModifiedBlocksState(null);
  }, [
    convexDocumentId,
    documentStore,
    refreshIsSaving,
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
      refreshIsSaving();
      commitModifiedBlocks();
    }, 1000);
    refreshIsSaving();
  }, [commitModifiedBlocks, refreshIsSaving]);

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

  return { modifiedBlocks, updateBlocks, isSaving };
}
