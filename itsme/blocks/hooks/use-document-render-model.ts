"use client";

import { useMemo } from "react";
import { DEFAULT_STYLE_SHEET, PAGE_SIZE } from "../blocks";
import { sanitizeRootLayout } from "../core/graph";
import { snapshotConvexToClient } from "../core/persistence/snapshot";
import type { DocumentBlocksSnapshot } from "../core/persistence/snapshot";
import type { ClientIdMappings } from "../core/persistence/snapshot";
import {
  renderDocumentLayout,
  type RenderedLayoutBlock,
} from "../renderer";
import { BlockTree } from "../renderer-types";
import type { Id } from "@/convex/_generated/dataModel";
import { StyleSheetSchema } from "../blocks";
import { DocumentSchema } from "../renderer";
import z from "zod";

type StyleSheet = z.infer<typeof StyleSheetSchema>;
type DocumentWithId = z.infer<typeof DocumentSchema> & { id: string };

type BlocksQueryData = {
  document: { id: Id<"documents">; name: string };
  layout: Id<"blocks">[];
  blocks: DocumentBlocksSnapshot["blocks"];
};

export function useDocumentRenderModel(args: {
  dpi: number;
  blocksQueryData: BlocksQueryData | undefined;
  blocksQueryReady: boolean;
  stylesQueryReady: boolean;
  styleSheet: StyleSheet | undefined;
  modifiedBlocks: DocumentBlocksSnapshot | null;
  clientIdMappings: ClientIdMappings;
  masterDocumentId: Id<"documents"> | null;
  convexDocumentId: Id<"documents">;
  masterBlocksQueryData: BlocksQueryData | undefined;
  masterBlocksQueryReady: boolean;
  masterStylesQueryReady: boolean;
  masterStyleSheet: StyleSheet | undefined;
}) {
  const {
    dpi,
    blocksQueryData,
    blocksQueryReady,
    stylesQueryReady,
    styleSheet,
    modifiedBlocks,
    clientIdMappings,
    masterDocumentId,
    convexDocumentId,
    masterBlocksQueryData,
    masterBlocksQueryReady,
    masterStylesQueryReady,
    masterStyleSheet,
  } = args;

  const renderedDocument = useMemo((): DocumentWithId | null => {
    if (!blocksQueryReady || !stylesQueryReady || !blocksQueryData || !styleSheet) {
      return null;
    }

    const normalizedServer = snapshotConvexToClient(
      blocksQueryData,
      clientIdMappings.convexToClient
    );
    const source = modifiedBlocks ?? normalizedServer;

    const cleaned = sanitizeRootLayout({
      name: source.document.name,
      pageSize: PAGE_SIZE,
      styleSheet,
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
    blocksQueryData,
    blocksQueryReady,
    modifiedBlocks,
    styleSheet,
    stylesQueryReady,
    clientIdMappings,
  ]);

  const masterDocument = useMemo((): DocumentWithId | null => {
    if (masterDocumentId === null) {
      return null;
    }
    if (masterDocumentId === convexDocumentId) {
      return renderedDocument;
    }
    if (
      !masterBlocksQueryReady ||
      !masterStylesQueryReady ||
      !masterBlocksQueryData ||
      !masterStyleSheet
    ) {
      return null;
    }

    const cleaned = sanitizeRootLayout({
      name: masterBlocksQueryData.document.name,
      pageSize: PAGE_SIZE,
      styleSheet: masterStyleSheet,
      blocks: masterBlocksQueryData.blocks,
      layout: masterBlocksQueryData.layout,
    });

    return {
      id: masterBlocksQueryData.document.id,
      name: cleaned.name,
      blocks: cleaned.blocks,
      layout: cleaned.layout,
      styleSheet: cleaned.styleSheet,
      pageSize: cleaned.pageSize,
    };
  }, [
    convexDocumentId,
    masterBlocksQueryData,
    masterBlocksQueryReady,
    masterDocumentId,
    masterStyleSheet,
    masterStylesQueryReady,
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
      rendered: [] as RenderedLayoutBlock[],
      blockTree: new BlockTree(),
    };
  }, [renderedDocument, dpi, canMeasureText]);

  return { renderedDocument, masterDocument, rendered };
}
