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
      blockType: "text" | "list";
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

export function selectFocusBlockId(state: DocumentStoreState): string | null {
  return selectEditBlockAction(state)?.blockId ?? null;
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
