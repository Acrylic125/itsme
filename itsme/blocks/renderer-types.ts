import z from "zod";
import { BlockSchema, StyleSheetSchema } from "./blocks";

type Pos = {
  x: number;
  y: number;
};

type BlockRendererMap = {
  [T in z.infer<typeof BlockSchema>["type"]]: BlockRenderer<T>;
};

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
      width: number;
    },
    ctx: BlockRendererContext
  ) => {
    estimatedDimensions: { width: number; height: number };
    component: () => React.ReactNode;
  };
};
