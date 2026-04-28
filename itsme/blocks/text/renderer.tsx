"use client";

import { TextBlockSchema, TextStyleSchema } from "./schema";
import { z } from "zod";
import { Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import { BlockRenderer, BlockTree } from "../renderer-types";
import { HoverRegion, ReorderRegion } from "@/components/shared-block";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDomPopup } from "@/components/dom-popup";
import { useDocumentStores, useDocumentStore } from "@/blocks/document-context";
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
  const { updateQueueStore } = useDocumentStores();
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
  blockTree,
  style,
  fontSizePx,
}: {
  block: z.infer<typeof TextBlockSchema>;
  dimensions: { width: number; height: number };
  parents: string[];
  blockTree: BlockTree;
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
  const { documentStore } = useDocumentStores();
  const { focusBlock } = useStore(
    documentStore,
    useShallow((s) => ({
      focusBlock: s.focusBlock,
    }))
  );
  const focusedBlockId = useStore(documentStore, (s) => s.focusBlockId);
  const handleClick = useCallback(
    (args: {
      anchor: { left: number; top: number; width: number; height: number };
    }) => {
      focusBlock(block.id);
      popup.openPopup({
        anchor: args.anchor,
        popupKey,
        content: ({ closePopup }) => (
          <EditTextModal key={popupKey} block={block} closePopup={closePopup} />
        ),
      });
    },
    [popup, block, popupKey, focusBlock]
  );

  let isDisabled;
  if (focusedBlockId !== null) {
    // Top level, can still focus. But not if it's child is focused.
    if (parents.length === 0) {
      isDisabled = blockTree.isNodeParentOf({
        parent: block.id,
        child: focusedBlockId,
      });
    } else {
      isDisabled = parents[parents.length - 1] !== focusedBlockId;
      // If parent block is not focused, we try to see if the current block
      if (isDisabled) {
        isDisabled =
          parents[parents.length - 1] !==
          blockTree.getDirectParentOf(focusedBlockId);
      }
    }
  } else {
    isDisabled = parents.length > 0;
  }

  return (
    <HoverRegion
      x={pos.relativeTo.x}
      y={pos.relativeTo.y}
      width={dimensions.width}
      height={dimensions.height}
      disabled={isDisabled}
      inFocus={focusedBlockId === block.id}
      onClick={handleClick}
    >
      <ReorderRegion
        blockId={block.id}
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
      </ReorderRegion>
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
      parents: [...relativeTo.parents, block.id],
      x: pos.canvas.from.x - relativeTo.x,
      y: pos.canvas.from.y - relativeTo.y,
      width: relativeTo.width,
      height: dimensions.height,
    };

    return {
      estimatedDimensions: dimensions,
      component: () => (
        <TextBlockComponent
          block={block}
          dimensions={dimensions}
          parents={relativeTo.parents}
          blockTree={ctx.blockTree}
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
