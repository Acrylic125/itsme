"use client";

import { useMemo } from "react";
import { Group, Rect } from "react-konva";
import { useStore } from "zustand/react";
import { useDocument } from "@/blocks/document-context";
import { hasBlockDiffToMaster } from "@/blocks/master-diff";
import type { RenderedLayoutBlock } from "@/blocks/renderer";

function findTreeNodeByBlockId(
  roots: RenderedLayoutBlock["tree"][],
  blockId: string
): RenderedLayoutBlock["tree"] | null {
  const queue = [...roots];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    if (next.blockId === blockId) {
      return next;
    }
    queue.push(...next.children);
  }
  return null;
}

export function MasterDiffLayer() {
  const {
    blocks,
    document,
    masterDocument,
    masterDocumentId,
    projectId,
    documentStore,
  } = useDocument();
  const clientToConvex = useStore(
    documentStore,
    (state) => state.clientIdMappings.clientToConvex
  );

  const diffBlocks = useMemo(() => {
    if (
      projectId === null ||
      !document ||
      !masterDocumentId ||
      document.id === masterDocumentId ||
      !masterDocument
    ) {
      return [];
    }

    const renderTrees = blocks.map((block) => block.tree);
    return document.blocks
      .filter((block) =>
        hasBlockDiffToMaster({
          document,
          masterDocument,
          blockId: block.id,
          clientToConvex,
        })
      )
      .map((block) => findTreeNodeByBlockId(renderTrees, block.id))
      .filter((node): node is RenderedLayoutBlock["tree"] => node != null);
  }, [
    blocks,
    clientToConvex,
    document,
    masterDocument,
    masterDocumentId,
    projectId,
  ]);

  if (
    projectId === null ||
    !document ||
    !masterDocumentId ||
    document.id === masterDocumentId ||
    !masterDocument
  ) {
    return null;
  }

  return (
    <Group listening={false}>
      {diffBlocks.map((block) => (
        <Rect
          key={block.blockId}
          x={block.estimatedDimensions.x}
          y={block.estimatedDimensions.y}
          width={block.estimatedDimensions.width}
          height={block.estimatedDimensions.height}
          fill="#FFFBEB"
          stroke="#FEE685"
          strokeWidth={2}
          cornerRadius={6}
          dash={[6, 4]}
          perfectDrawEnabled={false}
          listening={false}
        />
      ))}
    </Group>
  );
}
