import { createStore } from "zustand/vanilla";
import type { BlockTreeReorderBoundingBox, Pos } from "../renderer-types";
import {
  createEmptyClientIdMappings,
  mergeClientIdMappingRecord,
} from "./persistence/snapshot";
import type { ClientIdMappings } from "./persistence/snapshot";

export type { ClientIdMappings };

/**
 * The single in-flight user interaction with the document.
 */
export type DocumentStoreAction =
  | {
      type: "edit-block";
      blockId: string;
    }
  | {
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
      blockType: "text" | "list" | "spacer";
      current: {
        position: Pos;
      } | null;
      targetBlock: BlockTreeReorderBoundingBox | null;
    }
  | {
      type: "paste-block";
      current: {
        position: Pos;
      } | null;
      targetBlock: BlockTreeReorderBoundingBox | null;
    }
  | {
      type: "resize-column";
      blockId: string;
      columnsBlockId: string;
      childIndex: number;
      siblingCount: number;
      kind: "left" | "right";
      columnRowWidthPx: number;
      pointerStart: Pos;
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

export function documentActionOf<T extends DocumentStoreAction["type"]>(
  action: DocumentStoreAction | null,
  type: T
): Extract<DocumentStoreAction, { type: T }> | null {
  return action?.type === type
    ? (action as Extract<DocumentStoreAction, { type: T }>)
    : null;
}

/** Block id with focus ring (edit or focus-only selection). */
export function selectFocusBlockId(state: DocumentStoreState): string | null {
  const a = state.action;
  if (a?.type === "edit-block" || a?.type === "focus-block") {
    return a.blockId;
  }
  return null;
}

export function selectActiveBlockId(state: DocumentStoreState): string | null {
  const action = state.action;
  if (!action) {
    return null;
  }
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
