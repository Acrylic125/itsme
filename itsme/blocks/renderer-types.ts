import z from "zod";
import { BlockSchema, StyleSheetSchema } from "./blocks";

export type Pos = {
  x: number;
  y: number;
};

type BlockRendererMap = {
  [T in z.infer<typeof BlockSchema>["type"]]: BlockRenderer<T>;
};

export type BlockTree = {
  id: string;
  children: BlockTree[];
};

export function isBlockInTree(blockId: string, tree: BlockTree): boolean {
  if (tree.id === blockId) {
    return true;
  }
  return tree.children.some((child) => isBlockInTree(blockId, child));
}

export type BlockRendererContext = {
  styleSheet: z.infer<typeof StyleSheetSchema>;
  dpi: number;
  getNextPosition(): Pos;
  setNextPosition(pos: Pos): void;
  claimBlockSpace(height: number): {
    canvas: {
      from: Pos;
      to: Pos;
    };
  };
  allBlocks: z.infer<typeof BlockSchema>[];
  renderers: BlockRendererMap;
  //   renderers: BlockRenderer<z.infer<typeof BlockSchema>["type"]>[];
};

export type BlockRenderer<T extends z.infer<typeof BlockSchema>["type"]> = {
  type: T;
  render: (
    block: Extract<z.infer<typeof BlockSchema>, { type: T }>,
    relativeTo: Pos & {
      // blockId: string | null;
      parents: string[]; // Last element is the direct parent.
      width: number;
    },
    ctx: BlockRendererContext
  ) => {
    estimatedDimensions: { width: number; height: number };
    component: () => React.ReactNode;
  };
};
