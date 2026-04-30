"use client";

import { TextBlockSchema, TextStyleSchema } from "./schema";
import { z } from "zod";
import { Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import {
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDomPopup } from "@/components/dom-popup";
import { useDocument, useDocumentStore } from "@/blocks/document-context";
import { useCallback, useId, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";

export function EditTextModal({
  closePopup,
  block,
}: {
  closePopup: () => void;
  block: z.infer<typeof TextBlockSchema>;
}) {
  const { documentId, patchDocument } = useDocumentStore(
    useShallow((s) => ({
      documentId: s.documentId,
      patchDocument: s.update,
    }))
  );
  const { updateQueueStore } = useDocument();
  const [text, setText] = useState(block.text);

  const handleSave = useCallback(() => {
    patchDocument(updateQueueStore, {
      type: "text",
      documentId,
      blockId: block.id,
      text,
      align: block.align,
      style: block.style,
    });
    closePopup();
  }, [
    patchDocument,
    updateQueueStore,
    documentId,
    block.id,
    block.align,
    block.style,
    text,
    closePopup,
  ]);

  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4 rounded-xl shadow-xl">
      <Textarea
        className="w-full"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
      />
      <div className="flex gap-2">
        <Button className="w-fit" type="button" onClick={handleSave}>
          Save
        </Button>
        <Button
          className="w-fit"
          type="button"
          variant="outline"
          onClick={closePopup}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TextBlockComponent({
  block,
  dimensions,
  pos,
  parents,
  style,
  fontSizePx,
}: {
  block: z.infer<typeof TextBlockSchema>;
  dimensions: { width: number; height: number };
  parents: string[];
  pos: {
    relativeTo: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  style: z.infer<typeof TextStyleSchema>;
  fontSizePx: number;
}) {
  const popup = useDomPopup();
  const popupKey = useId();
  const { documentStore, blockTree } = useDocument();
  const { focusBlock, focusBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      focusBlock: s.focusBlock,
      focusBlockId: s.focusBlockId,
    }))
  );
  const handleClick = useCallback(
    (args: {
      anchor: { left: number; top: number; width: number; height: number };
    }) => {
      focusBlock(block.id);
      popup.openPopup({
        anchor: args.anchor,
        popupKey,
        onClose: () => {
          focusBlock((cur) => {
            if (cur === block.id) {
              return null;
            }
            return cur;
          });
        },
        content: ({ closePopup }) => (
          <EditTextModal
            key={popupKey}
            block={block}
            closePopup={() => {
              closePopup();
              focusBlock((cur) => {
                if (cur === block.id) {
                  return null;
                }
                return cur;
              });
            }}
          />
        ),
      });
    },
    [popup, block, popupKey, focusBlock]
  );

  const isDisabled = useInteractableBlock({
    focusBlockId,
    parents,
    blockId: block.id,
    blockTree,
  });

  return (
    <InteractableBlock
      blockId={block.id}
      x={pos.relativeTo.x}
      y={pos.relativeTo.y}
      width={dimensions.width}
      height={dimensions.height}
      disabled={isDisabled}
      inFocus={focusBlockId === block.id}
      onClick={handleClick}
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
    </InteractableBlock>
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
      parents: [...relativeTo.parents, block.id],
      x: pos.canvas.from.x - relativeTo.x,
      y: pos.canvas.from.y - relativeTo.y,
      width: relativeTo.width,
      height: dimensions.height,
    };

    return {
      blockId: block.id,
      estimatedDimensions: dimensions,
      boundingBoxes: getEdgeReorderBoundingBoxes({
        blockId: block.id,
        from: pos.canvas.from,
        to: {
          x: pos.canvas.from.x + dimensions.width,
          y: pos.canvas.from.y + dimensions.height,
        },
        visualSize: REORDER_BOUNDING_BOX_VISUAL_SIZE,
        targetSize: REORDER_BOUNDING_BOX_TARGET_SIZE,
      }),
      children: [],
      component: () => (
        <TextBlockComponent
          block={block}
          dimensions={dimensions}
          parents={relativeTo.parents}
          pos={{
            relativeTo: posRelativeTo,
          }}
          style={style}
          fontSizePx={fontSizePx}
        />
      ),
    };
  },
};
