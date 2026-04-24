"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
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
import { DocumentSchema } from "./renderer";
import type { Block } from "./blocks";
import { BlockUpdateSchema } from "./updater";

export type DocumentId = string;

export type Document = z.infer<typeof DocumentSchema>;

export type DocumentWithId = Document & { id: DocumentId };

export type BlockUpdate = z.infer<typeof BlockUpdateSchema>;

/** Key for deduping queue entries: one pending update per document + block pair. */
export function documentBlockUpdateKey(update: BlockUpdate): string {
  switch (update.type) {
    case "text":
      return `${update.documentId}:${update.blockId}`;
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

function applyBlockUpdate(doc: Document, update: BlockUpdate): Document {
  if (update.type !== "text") {
    return doc;
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

  return { ...doc, blocks };
}

export type DocumentUpdateQueueState = {
  updates: Record<string, BlockUpdate>;
};

export type DocumentUpdateQueueActions = {
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

  type QueueStore = DocumentUpdateQueueState & DocumentUpdateQueueActions;

  return createStore(
    persist<QueueStore, [], [], Pick<DocumentUpdateQueueState, "updates">>(
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
};

export type DocumentStoreActions = {
  update: (queue: DocumentUpdateQueueStore, update: BlockUpdate) => void;
};

export type DocumentStore = ReturnType<typeof createDocumentStore>;

export function createDocumentStore(
  documentId: DocumentId,
  initialDocument: Document
) {
  return createStore<DocumentStoreState & DocumentStoreActions>((set, get) => ({
    documentId,
    document: initialDocument,
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

type DocumentStoresContextValue = {
  documentStore: DocumentStore;
  updateQueueStore: DocumentUpdateQueueStore;
};

const DocumentStoresContext = createContext<DocumentStoresContextValue | null>(
  null
);

export function DocumentStoresProvider({
  document,
  children,
}: {
  document: DocumentWithId;
  children: ReactNode;
}) {
  const [stores] = useState(() => ({
    documentStore: createDocumentStore(
      document.id,
      documentPayloadFromWithId(document)
    ),
    updateQueueStore: createDocumentUpdateQueueStore(),
  }));

  useLayoutEffect(() => {
    const payload = documentPayloadFromWithId(document);
    stores.documentStore.setState({
      documentId: document.id,
      document: payload,
    });
  }, [document, stores.documentStore]);

  const value = useMemo<DocumentStoresContextValue>(
    () => ({
      documentStore: stores.documentStore,
      updateQueueStore: stores.updateQueueStore,
    }),
    [stores]
  );

  return (
    <DocumentStoresContext.Provider value={value}>
      {children}
    </DocumentStoresContext.Provider>
  );
  //   return createElement(DocumentStoresContext.Provider, { value }, children);
}

export function useDocumentStores(): DocumentStoresContextValue {
  const ctx = useContext(DocumentStoresContext);
  if (!ctx) {
    throw new Error(
      "useDocumentStores must be used within DocumentStoresProvider"
    );
  }
  return ctx;
}

export function useDocumentStore<T>(
  selector: (s: DocumentStoreState & DocumentStoreActions) => T
): T {
  const { documentStore } = useDocumentStores();
  return useStore(documentStore, selector);
}

export function useDocumentUpdateQueueStore<T>(
  selector: (s: DocumentUpdateQueueState & DocumentUpdateQueueActions) => T
): T {
  const { updateQueueStore } = useDocumentStores();
  return useStore(updateQueueStore, selector);
}
