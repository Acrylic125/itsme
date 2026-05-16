"use client";

import { useEffect } from "react";
import { collectSubtreeBlocksInDocumentOrder } from "../core/graph";
import {
  parseCopyPasteClipboardPayload,
  serializeCopyPasteClipboard,
} from "../copy-paste-clipboard";
import type { DocumentStore } from "../core/document-store";
import type { Document } from "../document-context";
import { redoHistory, undoHistory, type ProjDocId } from "../session-store";

export function useDocumentKeyboardShortcuts(args: {
  renderedDocument: Document | null;
  documentStore: DocumentStore;
  projDocId: ProjDocId;
}) {
  const { renderedDocument, documentStore, projDocId } = args;

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
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [renderedDocument, documentStore, projDocId]);
}
