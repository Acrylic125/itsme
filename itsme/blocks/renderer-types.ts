import z from "zod";
import { BlockSchema, StyleSheetSchema } from "./blocks";

export type Pos = {
  x: number;
  y: number;
};

/** Passed from `columns` renderer to direct children for edge-drag span resizing. */
export type ColumnsResizeContext = {
  columnsBlockId: string;
  /** Full row inner width in layout px (matches columns `relativeTo.width`). */
  columnRowWidthPx: number;
  /** Sum of sibling spans (`tallySpans`). */
  totalSpan: number;
  /** Index of this block among column siblings. */
  childIndex: number;
  siblingCount: number;
};

type BlockRendererMap = {
  [T in z.infer<typeof BlockSchema>["type"]]: BlockRenderer<T>;
};

export type BlockTreeReorderBoundingBox = {
  type: "left" | "right" | "top" | "bottom" | "inner";
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

export const REORDER_BOUNDING_BOX_VISUAL_SIZE = 8; // px
export const REORDER_BOUNDING_BOX_TARGET_SIZE = 24; // px

export function getEdgeReorderBoundingBoxes(args: {
  blockId: string;
  from: Pos;
  to: Pos;
  visualSize: number;
  targetSize: number;
}): BlockTreeReorderBoundingBox[] {
  const { blockId, from, to, visualSize, targetSize } = args;

  return [
    {
      type: "top",
      blockId,
      visual: {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: from.y + visualSize },
      },
      target: {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: from.y + targetSize },
      },
    },
    {
      type: "right",
      blockId,
      visual: {
        from: { x: to.x - visualSize, y: from.y },
        to: { x: to.x, y: to.y },
      },
      target: {
        from: { x: to.x - targetSize, y: from.y },
        to: { x: to.x, y: to.y },
      },
    },
    {
      type: "bottom",
      blockId,
      visual: {
        from: { x: from.x, y: to.y - visualSize },
        to: { x: to.x, y: to.y },
      },
      target: {
        from: { x: from.x, y: to.y - targetSize },
        to: { x: to.x, y: to.y },
      },
    },
    {
      type: "left",
      blockId,
      visual: {
        from: { x: from.x, y: from.y },
        to: { x: from.x + visualSize, y: to.y },
      },
      target: {
        from: { x: from.x, y: from.y },
        to: { x: from.x + targetSize, y: to.y },
      },
    },
  ];
}

export class BlockTree {
  private parentHasChild: Record<string, string[]>;
  private childHasParent: Record<string, string>;
  private reorderBoundingBoxes: BlockTreeReorderBoundingBox[];

  constructor(args?: {
    parentHasChild?: Record<string, string[]>;
    childHasParent?: Record<string, string>;
    reorderBoundingBoxes?: BlockTreeReorderBoundingBox[];
  }) {
    this.parentHasChild = args?.parentHasChild ?? {};
    this.childHasParent = args?.childHasParent ?? {};
    this.reorderBoundingBoxes = args?.reorderBoundingBoxes ?? [];
    // Remove duplicate reorder bounding boxes.
    const reorderBoundingBoxDict = this.reorderBoundingBoxes.reduce(
      (dict, box) => {
        const key = `${box.blockId}:${box.type}`;
        dict[key] = box;
        return dict;
      },
      {} as Record<string, BlockTreeReorderBoundingBox>
    );
    this.reorderBoundingBoxes = Object.values(reorderBoundingBoxDict);
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

  getReorderBoundingBoxes(): BlockTreeReorderBoundingBox[] {
    return this.reorderBoundingBoxes;
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
      parents: string[]; // Last element is the direct parent.
      width: number;
      columnsResizeContext?: ColumnsResizeContext;
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
