"use client";

// import { HoverRegion } from "@/components/blocks-shared";
import { TextBlockSchema, TextStyleSchema } from "./schema";
import { z } from "zod";
import { Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import { BlockRenderer } from "../renderer-types";
import { HoverRegion } from "@/components/shared-block";

function TextBlockComponent({
  block,
  dimensions,
  pos,
  style,
  fontSizePx,
}: {
  block: z.infer<typeof TextBlockSchema>;
  dimensions: { width: number; height: number };
  pos: { x: number; y: number };
  style: z.infer<typeof TextStyleSchema>;
  fontSizePx: number;
}) {
  return (
    <HoverRegion
      x={pos.x}
      y={pos.y}
      width={dimensions.width}
      height={dimensions.height}
    >
      <Text
        x={0}
        y={0}
        width={dimensions.width}
        height={dimensions.height}
        text={block.text}
        fontFamily={style.fontFamily}
        fontSize={fontSizePx}
        lineHeight={style.lineHeight}
        fontStyle={style.fontWeight === "bold" ? "bold" : "normal"}
        align={block.align}
        fill="#000000"
        perfectDrawEnabled={false}
      />
    </HoverRegion>
  );
}

export const TextBlockRenderer: BlockRenderer<"text"> = {
  type: "text",
  render: (block, relativeTo, ctx) => {
    const style = ctx.styleSheet.text[block.style];
    // Text styles are authored in points; renderer layout works in canvas pixels.
    const fontSizePx = (style.fontSize * ctx.dpi) / 72;
    const prepared = prepare(
      block.text,
      `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`
    );
    const { lineCount } = layout(prepared, relativeTo.width, style.lineHeight);

    const dimensions = {
      width: relativeTo.width,
      height: lineCount * fontSizePx * style.lineHeight,
    };

    const pos = ctx.claimBlockSpace(dimensions.height);

    const posRelativeTo = {
      x: pos.canvas.from.x - relativeTo.x,
      y: pos.canvas.from.y - relativeTo.y,
    };

    return {
      estimatedDimensions: dimensions,
      component: () => (
        <TextBlockComponent
          block={block}
          dimensions={dimensions}
          pos={posRelativeTo}
          style={style}
          fontSizePx={fontSizePx}
        />
      ),
    };
  },
};
