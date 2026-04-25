"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Block } from "@/blocks/blocks";

type BlockFocusContextValue = {
  focusedBlockId: string | null;
  focusBlock: (blockId: string) => void;
  clearFocus: () => void;
  getParentBlockId: (blockId: string) => string | null;
  canFocusBlock: (blockId: string) => boolean;
  isBlockFocused: (blockId: string) => boolean;
  canInteractWithBlock: (blockId: string) => boolean;
  canDragBlock: (blockId: string) => boolean;
};

const BlockFocusContext = createContext<BlockFocusContextValue | null>(null);

export function useBlockFocusContext() {
  return useContext(BlockFocusContext);
}

function buildParentMap(blocks: Block[], layout: string[]) {
  const parentById = new Map<string, string | null>();

  for (const blockId of layout) {
    parentById.set(blockId, null);
  }

  for (const block of blocks) {
    switch (block.type) {
      case "section":
      case "list":
        for (const childBlockId of block.blocks) {
          parentById.set(childBlockId, block.id);
        }
        break;
      case "columns":
        for (const child of block.blocks) {
          parentById.set(child.blockId, block.id);
        }
        break;
      case "text":
        break;
    }
  }

  return parentById;
}

export function BlockFocusProvider({
  blocks,
  layout,
  children,
}: {
  blocks: Block[];
  layout: string[];
  children: ReactNode;
}) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const parentById = useMemo(
    () => buildParentMap(blocks, layout),
    [blocks, layout]
  );

  useEffect(() => {
    if (focusedBlockId && !parentById.has(focusedBlockId)) {
      setFocusedBlockId(null);
    }
  }, [focusedBlockId, parentById]);

  const getParentBlockId = useCallback(
    (blockId: string) => parentById.get(blockId) ?? null,
    [parentById]
  );

  const isAncestorOfFocusedBlock = useCallback(
    (blockId: string) => {
      let current = focusedBlockId;
      while (current) {
        const parent = parentById.get(current) ?? null;
        if (parent === blockId) return true;
        current = parent;
      }
      return false;
    },
    [focusedBlockId, parentById]
  );

  const canFocusBlock = useCallback(
    (blockId: string) => {
      if (!parentById.has(blockId)) return false;
      if (focusedBlockId === blockId) return true;
      const parentBlockId = parentById.get(blockId) ?? null;
      if (parentBlockId === null) return true;
      if (focusedBlockId === parentBlockId) return true;
      if (isAncestorOfFocusedBlock(parentBlockId)) return true;
      return isAncestorOfFocusedBlock(blockId);
    },
    [focusedBlockId, isAncestorOfFocusedBlock, parentById]
  );

  const value = useMemo<BlockFocusContextValue>(
    () => ({
      focusedBlockId,
      focusBlock: setFocusedBlockId,
      clearFocus: () => setFocusedBlockId(null),
      getParentBlockId,
      canFocusBlock,
      isBlockFocused: (blockId: string) => focusedBlockId === blockId,
      canInteractWithBlock: canFocusBlock,
      canDragBlock: (blockId: string) => {
        if (!parentById.has(blockId)) return false;
        const parentBlockId = parentById.get(blockId) ?? null;
        return parentBlockId === null || focusedBlockId === blockId;
      },
    }),
    [focusedBlockId, getParentBlockId, canFocusBlock, parentById]
  );

  return (
    <BlockFocusContext.Provider value={value}>
      {children}
    </BlockFocusContext.Provider>
  );
}
