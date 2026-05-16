"use client";

import { useMemo } from "react";
import { Group, Rect } from "react-konva";
import { useDocument } from "@/blocks/document-context";
import type { RenderedLayoutBlock } from "@/blocks/renderer";

function flattenRenderedTrees(
  roots: RenderedLayoutBlock["tree"][]
): RenderedLayoutBlock["tree"][] {
  const flat: RenderedLayoutBlock["tree"][] = [];
  const queue = [...roots];
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }
    flat.push(next);
    queue.push(...next.children);
  }
  return flat;
}

export function MasterDiffLayer() {
  const { blocks, document, masterDocument, masterDocumentId, projectId } =
    useDocument();

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

    const currentBlocksById = new Map(document.blocks.map((block) => [block.id, block]));
    const masterBlockIds = new Set(masterDocument.blocks.map((block) => block.id));

    return flattenRenderedTrees(blocks.map((block) => block.tree)).filter((node) => {
      const block = currentBlocksById.get(node.blockId);
      if (!block) {
        return false;
      }
      return block.ref === undefined || !masterBlockIds.has(block.ref);
    });
  }, [blocks, document, masterDocument, masterDocumentId, projectId]);

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
          fill="rgba(250, 204, 21, 0.18)"
          stroke="#eab308"
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
