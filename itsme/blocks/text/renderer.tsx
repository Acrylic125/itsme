"use client";

import { TextBlockSchema, TextStyleSchema } from "./schema";
import { z } from "zod";
import { Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import type { ColumnsResizeContext } from "../renderer-types";
import {
  BlockRenderer,
  getEdgeReorderBoundingBoxes,
  REORDER_BOUNDING_BOX_TARGET_SIZE,
  REORDER_BOUNDING_BOX_VISUAL_SIZE,
} from "../renderer-types";
import {
  getNormalizedAnchorRectForKonvaNode,
  InteractableBlock,
  useInteractableBlock,
} from "@/components/shared-block";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnchorRect } from "@/components/dom-popup";
import {
  asEditBlockAction,
  selectActiveBlockId,
  selectEditBlockAction,
  useDocument,
} from "@/blocks/document-context";
import Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import { Html } from "react-konva-utils";
import { useDebouncedCallback } from "use-debounce";
import { caretOffsetFromLocalPoint } from "./caret-from-pointer";

/** Shown only when `block.text` is empty; not persisted and not used as edit initial value. */
const EMPTY_TEXT_DISPLAY = "Click to set text";

export function EditTextModal({
  closePopup,
  block,
  initialCaretOffset,
}: {
  closePopup: () => void;
  block: z.infer<typeof TextBlockSchema>;
  /** UTF-16 offset in `block.text`; clamped on mount to textarea bounds. */
  initialCaretOffset: number;
}) {
  const { updateBlocks } = useDocument();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(block.text);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const at = Math.max(0, Math.min(initialCaretOffset, ta.value.length));
    ta.setSelectionRange(at, at);
  }, [initialCaretOffset]);

  const debouncedSave = useDebouncedCallback(
    (nextText: string) => {
      updateBlocks((current) => {
        const nextBlocks = current.blocks.map((b) => {
          if (b.id !== block.id) return b;
          if (b.type !== "text") return b;
          return {
            ...b,
            text: nextText,
            align: block.align,
            style: block.style,
          };
        });
        return { ...current, blocks: nextBlocks };
      });
    },
    500,
    { maxWait: 1500 }
  );

  useEffect(() => {
    return () => {
      // Ensure latest edits are persisted when closing/unmounting.
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  const handleChange = useCallback(
    (nextText: string) => {
      setText(nextText);
      debouncedSave(nextText);
    },
    [debouncedSave]
  );

  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4 rounded-xl shadow-xl">
      <Textarea
        ref={textareaRef}
        className="w-full"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
      />
      <div className="flex gap-2">
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
  columnsResizeContext,
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
  columnsResizeContext?: ColumnsResizeContext;
}) {
  // const popupKey = useId();
  const { documentStore, blockTree } = useDocument();
  const { setAction, editAction, activeBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      editAction: selectEditBlockAction(s),
      activeBlockId: selectActiveBlockId(s),
    }))
  );
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [initialCaretOffset, setInitialCaretOffset] = useState(0);
  const isEditingThisBlock = editAction?.blockId === block.id;
  const canvasGroupRef = useRef<Konva.Group | null>(null);

  useLayoutEffect(() => {
    if (!isEditingThisBlock || anchor) return;
    const syncAnchor = () => {
      const node = canvasGroupRef.current;
      if (!node) return;
      const rect = getNormalizedAnchorRectForKonvaNode(node);
      if (rect) setAnchor(rect);
    };
    syncAnchor();
    const frame = requestAnimationFrame(syncAnchor);
    return () => cancelAnimationFrame(frame);
  }, [anchor, block.id, isEditingThisBlock]);

  const closeTextEditor = useCallback(() => {
    setAnchor(null);
    setInitialCaretOffset(0);
    setAction((current) => {
      const editAction = asEditBlockAction(current);
      return editAction?.blockId === block.id ? null : current;
    });
  }, [block.id, setAction]);

  const handleClick = useCallback(
    (args: { anchor: AnchorRect }) => {
      const node = canvasGroupRef.current;
      const local = node?.getRelativePointerPosition();
      const caret =
        local != null
          ? caretOffsetFromLocalPoint({
              text: block.text,
              widthPx: dimensions.width,
              fontSizePx,
              lineHeight: style.lineHeight,
              fontFamily: style.fontFamily,
              fontWeight: style.fontWeight,
              align: block.align,
              localX: local.x,
              localY: local.y,
            })
          : 0;
      setAnchor(args.anchor);
      setInitialCaretOffset(caret);
      setAction({ type: "edit-block", blockId: block.id });
    },
    [
      block.align,
      block.id,
      block.text,
      dimensions.width,
      fontSizePx,
      setAction,
      style.fontFamily,
      style.fontWeight,
      style.lineHeight,
    ]
  );

  useEffect(() => {
    if (!anchor || !isEditingThisBlock) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTextEditor();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anchor, isEditingThisBlock, closeTextEditor]);

  const isDisabled = useInteractableBlock({
    activeBlockId,
    parents,
    blockId: block.id,
    blockTree,
  });
  return (
    <>
      <InteractableBlock
        blockId={block.id}
        x={pos.relativeTo.x}
        y={pos.relativeTo.y}
        width={dimensions.width}
        height={dimensions.height}
        disabled={isDisabled}
        inFocus={isEditingThisBlock}
        columnsResizeContext={columnsResizeContext}
        onKonvaGroupRef={(node) => {
          canvasGroupRef.current = node;
        }}
        onClick={handleClick}
      >
        <Text
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          text={block.text === "" ? EMPTY_TEXT_DISPLAY : block.text}
          fontFamily={style.fontFamily}
          fontSize={fontSizePx}
          lineHeight={style.lineHeight}
          fontStyle={style.fontWeight === "bold" ? "bold" : "normal"}
          align={block.align}
          fill={block.text === "" ? "#9a9a9a" : "#000000"}
          perfectDrawEnabled={false}
        />
        {anchor && isEditingThisBlock && (
          <Html
            transform={false}
            divProps={{
              style: {
                // width: 400,
                // height: 400,
                // // top: 20,
                // // left: 20,
                // top: "20%",
                // left: "20%",
                position: "absolute",
                // top: "10%",
                top: anchor.top * 100 + "%",
                left: anchor.left * 100 + "%",
                width: anchor.width * 100 + "%",
                height: anchor.height * 100 + "%",
              },
              // className: "w-full h-24",
            }}
          >
            <EditTextModal
              block={block}
              closePopup={closeTextEditor}
              initialCaretOffset={initialCaretOffset}
            />
            {/* <div className="h-1 w-full bg-amber-300" /> */}
          </Html>
        )}
      </InteractableBlock>
      {/* <Html
        divProps={{
          className: "pointer-events-none w-full h-full",
        }}
        transformFunc={(attrs) => ({
          ...attrs,
          // scaleX: 1,
          // scaleY: 1,
        })}
      >
        <div className="h-1 w-full bg-amber-300" />
      </Html> */}
    </>
  );
}

export const TextBlockRenderer: BlockRenderer<"text"> = {
  type: "text",
  render: (block, relativeTo, ctx) => {
    const style = ctx.styleSheet.text[block.style];
    // Text styles are authored in points; renderer layout works in canvas pixels.
    const fontSizePx = (style.fontSize * ctx.dpi) / 72;
    const layoutSourceText =
      block.text === "" ? EMPTY_TEXT_DISPLAY : block.text;
    const prepared = prepare(
      layoutSourceText,
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
          columnsResizeContext={relativeTo.columnsResizeContext}
        />
      ),
    };
  },
};
