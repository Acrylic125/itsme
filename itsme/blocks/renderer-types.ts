import z from "zod";
import { BlockSchema, StyleSheetSchema } from "./blocks";

export type Pos = {
  x: number;
  y: number;
};

type BlockRendererMap = {
  [T in z.infer<typeof BlockSchema>["type"]]: BlockRenderer<T>;
};

export type BlockTreeReorderBoundingBox = {
  type: "left" | "right" | "top" | "bottom";
  target: {
    from: Pos;
    to: Pos;
  };
  visual: {
    from: Pos;
    to: Pos;
  };
  blockId: string;
};

export class BlockTree {
  private parentHasChild: Record<string, string[]>;
  private childHasParent: Record<string, string>;

  constructor(args?: {
    parentHasChild?: Record<string, string[]>;
    childHasParent?: Record<string, string>;
  }) {
    this.parentHasChild = args?.parentHasChild ?? {};
    this.childHasParent = args?.childHasParent ?? {};
  }

  isNodeChildOf(nodes: { parent: string; child: string }): boolean {
    const { parent, child } = nodes;
    const directChildren = this.parentHasChild[parent] ?? [];
    return directChildren.includes(child);
  }

  isNodeParentOf(nodes: { parent: string; child: string }): boolean {
    const { parent, child } = nodes;
    return this.childHasParent[child] === parent;
  }

  getDirectParentOf(node: string): string | null {
    return this.childHasParent[node] ?? null;
  }
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
  // blockTree: BlockTree;
  renderers: BlockRendererMap;
  //   renderers: BlockRenderer<z.infer<typeof BlockSchema>["type"]>[];
};

export type BlockRenderer<T extends z.infer<typeof BlockSchema>["type"]> = {
  type: T;
  // getChildren: (
  //   block: Extract<z.infer<typeof BlockSchema>, { type: T }>
  // ) => string[];
  render: (
    block: Extract<z.infer<typeof BlockSchema>, { type: T }>,
    relativeTo: Pos & {
      // blockId: string | null;
      parents: string[]; // Last element is the direct parent.
      width: number;
    },
    ctx: BlockRendererContext
  ) => {
    blockId: string;
    boundingBoxes: BlockTreeReorderBoundingBox[];
    children: ReturnType<
      BlockRenderer<z.infer<typeof BlockSchema>["type"]>["render"]
    >[];
    estimatedDimensions: { width: number; height: number };
    component: () => React.ReactNode;
  };
};
