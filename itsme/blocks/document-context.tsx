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
import { BlockTree, Pos } from "./renderer-types";

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
  switch (update.type) {
    case "move":
      return applyBlockMove(doc, update);
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

  return { ...doc, blocks };
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
    position: Pos;
    blockIds: string[];
  } | null;
  update: (queue: DocumentUpdateQueueStore, update: BlockUpdate) => void;
  focusBlock: (
    blockId: string | ((current: string | null) => string | null) | null
  ) => void;
  setReorder: (
    reorder: {
      position: Pos;
      blockIds: string[];
    } | null
  ) => void;
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
    reorder: null,
    focusBlock: (blockId) => {
      if (typeof blockId === "function") {
        set({ focusBlockId: blockId(get().focusBlockId) });
      } else {
        set({ focusBlockId: blockId });
      }
    },
    setReorder: (reorder) => {
      set({ reorder });
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
  const rendered = useMemo(() => {
    if (canMeasureText) {
      return renderDocumentLayout({ document, dpi });
    }
    return {
      rendered: [],
      blockTree: new BlockTree(),
    };
  }, [document, dpi, canMeasureText]);

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
