import type { Block } from "./blocks";
import { buildBlockByIdMap } from "./core/graph";

type BlockDocumentLike = {
  blocks: Block[];
  layout: string[];
};

function toConvexBlockId(
  id: string,
  clientToConvex: Map<string, string>
): string {
  return clientToConvex.get(id) ?? id;
}

function resolveMasterBlockId(
  block: Block,
  masterBlockById: Map<string, Block>,
  clientToConvex: Map<string, string>
): string | null {
  if (block.ref) {
    if (masterBlockById.has(block.ref)) {
      return block.ref;
    }
    // Fallback when ref was incorrectly stored as a document-local client id.
    const refInMaster = toConvexBlockId(block.ref, clientToConvex);
    if (masterBlockById.has(refInMaster)) {
      return refInMaster;
    }
  }
  const idInMaster = toConvexBlockId(block.id, clientToConvex);
  if (masterBlockById.has(idInMaster)) {
    return idInMaster;
  }
  return null;
}

export function hasBlockDiffToMaster(args: {
  document: BlockDocumentLike | null;
  masterDocument: BlockDocumentLike | null;
  blockId: string;
  clientToConvex?: Map<string, string>;
}): boolean {
  const { document, masterDocument, blockId } = args;
  if (!document || !masterDocument) {
    return false;
  }

  const clientToConvex = args.clientToConvex ?? new Map<string, string>();
  const currentBlockById = buildBlockByIdMap(document.blocks);
  const currentBlock = currentBlockById.get(blockId);
  if (!currentBlock) {
    return false;
  }

  const masterBlockById = buildBlockByIdMap(masterDocument.blocks);
  const masterBlockId = resolveMasterBlockId(
    currentBlock,
    masterBlockById,
    clientToConvex
  );

  switch (currentBlock.type) {
    case "text": {
      if (!masterBlockId) {
        return true;
      }
      const masterBlock = masterBlockById.get(masterBlockId);
      if (!masterBlock || masterBlock.type !== "text") {
        return true;
      }
      return currentBlock.text !== masterBlock.text;
    }
    case "section":
    case "list":
    case "columns":
      return masterBlockId === null;
  }
}
