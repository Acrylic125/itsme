"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_STYLE_SHEET, StyleSheetSchema } from "../blocks";
import { pushHistoryOp, type ProjDocId } from "../session-store";
import z from "zod";

type StyleSheet = z.infer<typeof StyleSheetSchema>;
type DocumentTextPresetKey = keyof StyleSheet["text"];

function applyTextStylePatchListToStyleSheet(
  styleSheet: StyleSheet,
  patches: Array<{
    style: DocumentTextPresetKey;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    lineHeight?: number;
  }>
): StyleSheet {
  const text = { ...styleSheet.text };
  for (const p of patches) {
    text[p.style] = {
      ...text[p.style],
      ...(p.fontSize !== undefined ? { fontSize: p.fontSize } : {}),
      ...(p.fontWeight !== undefined ? { fontWeight: p.fontWeight } : {}),
      ...(p.lineHeight !== undefined ? { lineHeight: p.lineHeight } : {}),
    };
  }
  return { ...styleSheet, text };
}

export function useDocumentTextPresets(args: {
  convexDocumentId: Id<"documents">;
  convexProjectId: Id<"projects"> | null;
  projDocId: ProjDocId;
  styleSheet: StyleSheet | undefined;
}) {
  const { convexDocumentId, convexProjectId, projDocId, styleSheet } = args;

  const updateDocumentTextStylesMutation = useMutation(
    api.documentTasks.updateDocumentTextStyles
  );

  const syncProjectTextStylePresetAllDocumentsMutation = useMutation(
    api.documentTasks.syncProjectTextStylePresetAllDocuments
  );

  const syncDocumentTextPresetToMatch = useCallback(
    async (patch: {
      style: DocumentTextPresetKey;
      fontSize: number;
      fontWeight: "normal" | "bold";
      lineHeight: number;
    }) => {
      const run = updateDocumentTextStylesMutation.withOptimisticUpdate(
        (localStore, mutationArgs) => {
          const current = localStore.getQuery(
            api.documentTasks.getDocumentStyles,
            { documentId: mutationArgs.documentId }
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

      const prev =
        styleSheet?.text[patch.style] ?? DEFAULT_STYLE_SHEET.text[patch.style];

      await run({
        documentId: convexDocumentId,
        patches: [patch],
      });

      if (styleSheet) {
        pushHistoryOp(projDocId, {
          down: () => {
            void run({
              documentId: convexDocumentId,
              patches: [
                {
                  style: patch.style,
                  fontSize: prev.fontSize,
                  fontWeight: prev.fontWeight,
                  lineHeight: prev.lineHeight,
                },
              ],
            });
          },
          up: () => {
            void run({
              documentId: convexDocumentId,
              patches: [patch],
            });
          },
        });
      }
    },
    [convexDocumentId, projDocId, styleSheet, updateDocumentTextStylesMutation]
  );

  const syncProjectTextPresetToMatch = useCallback(
    async (patch: {
      style: DocumentTextPresetKey;
      fontSize: number;
      fontWeight: "normal" | "bold";
      lineHeight: number;
    }) => {
      if (!convexProjectId) {
        return;
      }

      const prev =
        styleSheet?.text[patch.style] ?? DEFAULT_STYLE_SHEET.text[patch.style];

      await syncProjectTextStylePresetAllDocumentsMutation({
        projectId: convexProjectId,
        style: patch.style,
        fontSize: patch.fontSize,
        fontWeight: patch.fontWeight,
        lineHeight: patch.lineHeight,
      });

      if (styleSheet) {
        pushHistoryOp(projDocId, {
          down: () => {
            void syncProjectTextStylePresetAllDocumentsMutation({
              projectId: convexProjectId,
              style: patch.style,
              fontSize: prev.fontSize,
              fontWeight: prev.fontWeight,
              lineHeight: prev.lineHeight,
            });
          },
          up: () => {
            void syncProjectTextStylePresetAllDocumentsMutation({
              projectId: convexProjectId,
              ...patch,
            });
          },
        });
      }
    },
    [
      convexProjectId,
      projDocId,
      styleSheet,
      syncProjectTextStylePresetAllDocumentsMutation,
    ]
  );

  return { syncDocumentTextPresetToMatch, syncProjectTextPresetToMatch };
}
