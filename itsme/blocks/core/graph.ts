import type { Block } from "../blocks";

export type BlockDocument = {
  blocks: Block[];
  layout: string[];
};

export type ParentRef =
  | {
      container: "document";
      index: number;
    }
  | {
      container: "section" | "list";
      parentBlockId: string;
      index: number;
    }
  | {
      container: "columns";
      parentBlockId: string;
      index: number;
      span: number;
    };

/** Direct child block ids for a block row (empty for leaf text blocks). */
export function getChildBlockIds(block: Block): string[] {
  switch (block.type) {
    case "section":
    case "list":
      return block.blocks;
    case "columns":
      return block.blocks.map((child) => child.blockId);
    case "text":
      return [];
  }
}

export function buildBlockByIdMap(
  blocks: Block[]
): Map<string, Block> {
  return new Map(blocks.map((block) => [block.id, block]));
}

/** DFS: collects ids in root-first document order. */
export function collectSubtreeBlockIds(
  blocks: Block[],
  rootBlockId: string
): string[] | null {
  const blockById = buildBlockByIdMap(blocks);
  if (!blockById.get(rootBlockId)) {
    return null;
  }
  const ordered: string[] = [];
  const visit = (id: string) => {
    const block = blockById.get(id);
    if (!block) {
      return;
    }
    ordered.push(id);
    for (const childId of getChildBlockIds(block)) {
      visit(childId);
    }
  };
  visit(rootBlockId);
  return ordered;
}

/** DFS order: root first, then descendants. */
export function collectSubtreeBlocksInDocumentOrder(
  doc: BlockDocument,
  rootBlockId: string
): Block[] | null {
  const ids = collectSubtreeBlockIds(doc.blocks, rootBlockId);
  if (!ids) {
    return null;
  }
  const blockById = buildBlockByIdMap(doc.blocks);
  return ids
    .map((id) => blockById.get(id))
    .filter((b): b is Block => b != null);
}

export function collectSubtreeIdsInto(
  blocks: Block[],
  rootId: string,
  into: Set<string>
): void {
  const blockById = buildBlockByIdMap(blocks);
  const visit = (id: string) => {
    into.add(id);
    const block = blockById.get(id);
    if (!block) {
      return;
    }
    for (const childId of getChildBlockIds(block)) {
      visit(childId);
    }
  };
  visit(rootId);
}

export function findParentRef(
  doc: BlockDocument,
  childBlockId: string
): ParentRef | null {
  for (const block of doc.blocks) {
    switch (block.type) {
      case "section": {
        const index = block.blocks.indexOf(childBlockId);
        if (index >= 0) {
          return {
            container: "section",
            parentBlockId: block.id,
            index,
          };
        }
        break;
      }
      case "list": {
        const index = block.blocks.indexOf(childBlockId);
        if (index >= 0) {
          return {
            container: "list",
            parentBlockId: block.id,
            index,
          };
        }
        break;
      }
      case "columns": {
        const index = block.blocks.findIndex(
          (child) => child.blockId === childBlockId
        );
        if (index >= 0) {
          return {
            container: "columns",
            parentBlockId: block.id,
            index,
            span: block.blocks[index]!.span,
          };
        }
        break;
      }
      case "text":
        break;
    }
  }

  const documentIndex = doc.layout.indexOf(childBlockId);
  if (documentIndex >= 0) {
    return { container: "document", index: documentIndex };
  }

  return null;
}

/** Container block id for a nested block, or `null` at document root. */
export function getParentBlockId(
  doc: BlockDocument,
  blockId: string
): string | null {
  const ref = findParentRef(doc, blockId);
  if (!ref || ref.container === "document") {
    return null;
  }
  return ref.parentBlockId;
}

export function isDescendantOf(
  doc: BlockDocument,
  possibleDescendantId: string,
  ancestorId: string
): boolean {
  const blockById = buildBlockByIdMap(doc.blocks);
  const visit = (blockId: string): boolean => {
    const block = blockById.get(blockId);
    if (!block) {
      return false;
    }
    for (const childBlockId of getChildBlockIds(block)) {
      if (childBlockId === possibleDescendantId) {
        return true;
      }
      if (visit(childBlockId)) {
        return true;
      }
    }
    return false;
  };

  return visit(ancestorId);
}

/** True if `descendantId` is strictly nested under `ancestorId` (not equal). */
export function isNestedInsideBlock(
  doc: BlockDocument,
  ancestorId: string,
  descendantId: string
): boolean {
  return isDescendantOf(doc, descendantId, ancestorId);
}

/**
 * Drops layout entries for ids that already appear as children of
 * section/list/columns.
 */
export function pruneStaleLayoutReferences<T extends BlockDocument>(
  doc: T
): T {
  const nestedChildIds = new Set<string>();
  for (const block of doc.blocks) {
    for (const childId of getChildBlockIds(block)) {
      nestedChildIds.add(childId);
    }
  }
  if (nestedChildIds.size === 0) {
    return doc;
  }
  const nextLayout = doc.layout.filter((id) => !nestedChildIds.has(id));
  if (nextLayout.length === doc.layout.length) {
    return doc;
  }
  return { ...doc, layout: nextLayout };
}

/**
 * Root `layout` must only reference top-level blocks that exist in `blocks`.
 */
export function sanitizeRootLayout<T extends BlockDocument>(doc: T): T {
  const pruned = pruneStaleLayoutReferences(doc);
  const blockIds = new Set(pruned.blocks.map((b) => b.id));
  const nextLayout = pruned.layout.filter((id) => blockIds.has(id));
  if (nextLayout.length === pruned.layout.length) {
    return pruned;
  }
  return { ...pruned, layout: nextLayout };
}

/** Block ids referenced as children but not listed as roots in the payload. */
export function getNestedChildIdSet(blocks: Block[]): Set<string> {
  const nested = new Set<string>();
  for (const block of blocks) {
    for (const childId of getChildBlockIds(block)) {
      nested.add(childId);
    }
  }
  return nested;
}

/** Structural roots: blocks not referenced as any other block's child. */
export function getStructuralRootBlocks(blocks: Block[]): Block[] {
  const referenced = getNestedChildIdSet(blocks);
  return blocks.filter((b) => !referenced.has(b.id));
}
