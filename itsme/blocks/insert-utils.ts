import db from "@/db/db";
import { blocks, documentMainLayout } from "@/db/schema";
import type { Block } from "./blocks";
import { ColumnsBlockInserter } from "./columns/server";
import { ListBlockInserter } from "./list/server";
import { SectionBlockInserter } from "./section/server";
import { TextBlockInserter } from "./text/server";

function getChildBlockIds(block: Block): string[] {
  switch (block.type) {
    case "text":
      return [];
    case "section":
    case "list":
      return block.blocks;
    case "columns":
      return block.blocks.map((child) => child.blockId);
  }
}

function validateBlockGraph(blockList: Block[]) {
  const blockById = new Map<string, Block>();
  const referencedBlockIds = new Set<string>();

  for (const block of blockList) {
    if (blockById.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }
    blockById.set(block.id, block);
  }

  for (const block of blockList) {
    for (const childBlockId of getChildBlockIds(block)) {
      if (!blockById.has(childBlockId)) {
        throw new Error(
          `Block ${block.id} references missing child block ${childBlockId}.`
        );
      }
      referencedBlockIds.add(childBlockId);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (blockId: string, path: string[]) => {
    if (visiting.has(blockId)) {
      const loopStartIndex = path.indexOf(blockId);
      const cyclePath =
        loopStartIndex >= 0
          ? [...path.slice(loopStartIndex), blockId]
          : [...path, blockId];
      throw new Error(`Block loop detected: ${cyclePath.join(" -> ")}`);
    }
    if (visited.has(blockId)) {
      return;
    }

    visiting.add(blockId);
    const block = blockById.get(blockId);
    if (!block) {
      throw new Error(`Missing block during validation: ${blockId}`);
    }

    for (const childBlockId of getChildBlockIds(block)) {
      visit(childBlockId, [...path, blockId]);
    }

    visiting.delete(blockId);
    visited.add(blockId);
  };

  for (const block of blockList) {
    visit(block.id, []);
  }

  const mainLayoutBlockIds = blockList
    .map((block) => block.id)
    .filter((blockId) => !referencedBlockIds.has(blockId));

  return {
    mainLayoutBlockIds,
  };
}

export async function insertBlocksForDocument(args: {
  documentId: string;
  blocks: Block[];
}) {
  const { mainLayoutBlockIds } = validateBlockGraph(args.blocks);

  if (args.blocks.length > 0) {
    await db.insert(blocks).values(
      args.blocks.map((block, orderIndex) => ({
        id: block.id,
        documentId: args.documentId,
        type: block.type,
        orderIndex,
      }))
    );
  }

  for (const block of args.blocks) {
    switch (block.type) {
      case "text":
        await TextBlockInserter.insert({ block });
        break;
      case "section":
        await SectionBlockInserter.insert({ block });
        break;
      case "columns":
        await ColumnsBlockInserter.insert({ block });
        break;
      case "list":
        await ListBlockInserter.insert({ block });
        break;
      default: {
        const exhaustiveCheck: never = block;
        throw new Error(
          `No inserter found for block insertion: ${String(exhaustiveCheck)}`
        );
      }
    }
  }

  if (mainLayoutBlockIds.length > 0) {
    await db.insert(documentMainLayout).values(
      mainLayoutBlockIds.map((blockId, orderIndex) => ({
        documentId: args.documentId,
        blockId,
        orderIndex,
      }))
    );
  }

  return {
    mainLayoutBlockIds,
  };
}
