"use client";

import { TextBlockSchema, TextStyleSchema } from "./schema";
import { z } from "zod";
import { Text } from "react-konva";
import { prepare, layout } from "@chenglou/pretext";
import type { ColumnsResizeContext } from "../renderer-types";
import { DEFAULT_STYLE_SHEET } from "../blocks";
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
import { AnchorRect } from "@/components/dom-popup";
import {
  asEditBlockAction,
  asFocusBlockAction,
  selectActiveBlockId,
  selectEditBlockAction,
  useDocument,
} from "@/blocks/document-context";
import Konva from "konva";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import { Html } from "react-konva-utils";
import { useDebouncedCallback } from "use-debounce";
import { caretOffsetFromLocalPoint } from "./caret-from-pointer";
import { EditTextToolbar, clampTextEditFontSizePt } from "./edit-text-toolbar";

/** Shown only when `block.text` is empty; not persisted and not used as edit initial value. */
const EMPTY_TEXT_DISPLAY = "Click to set text";

/** Tailwind `p-2`: horizontal padding (left + right) in CSS px, converted to layout px via `canvasDisplayScale`. */
const TEXTAREA_PADDING_X_CSS_PX = 16;

function textareaRowsFromPretext(args: {
  text: string;
  /** Same units as Konva / block layout (`relativeTo.width`). */
  layoutWidthPx: number;
  textStyle: z.infer<typeof TextStyleSchema>;
  fontSizePx: number;
  canvasDisplayScale: number;
}): number {
  const { text, layoutWidthPx, textStyle, fontSizePx, canvasDisplayScale } =
    args;
  const scale = Math.max(canvasDisplayScale, 1e-6);
  const wrapWidthPx = Math.max(
    1,
    layoutWidthPx - TEXTAREA_PADDING_X_CSS_PX / scale
  );
  const prepared = prepare(
    text,
    `${textStyle.fontWeight} ${fontSizePx}px ${textStyle.fontFamily}`
  );
  const { lineCount } = layout(prepared, wrapWidthPx, textStyle.lineHeight);
  return Math.max(1, lineCount);
}

export function EditTextModal({
  block,
  onClose,
  initialCaretOffset,
  layoutWidthPx,
  /** Konva cumulative scale (e.g. `Layer` fit-to-container); DOM CSS px must match this for parity with canvas text. */
  canvasDisplayScale = 1,
}: {
  block: z.infer<typeof TextBlockSchema>;
  onClose: () => void;
  initialCaretOffset: number;
  layoutWidthPx: number;
  canvasDisplayScale?: number;
}) {
  const {
    updateBlocks,
    document,
    dpi,
    syncDocumentTextPresetToMatch,
    syncProjectTextPresetToMatch,
    projectId,
  } = useDocument();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(block.text);

  const textSheet = document?.styleSheet.text ?? DEFAULT_STYLE_SHEET.text;

  const [blockStyle, setBlockStyle] = useState(() => block.style);
  const [fontSizePt, setFontSizePt] = useState(
    () => block.fontSize ?? textSheet[block.style].fontSize
  );
  const [fontWeightUi, setFontWeightUi] = useState<"normal" | "bold">(
    () => block.fontWeight ?? textSheet[block.style].fontWeight
  );
  const [alignUi, setAlignUi] = useState(() => block.align);

  const localResolvedStyle = useMemo(() => {
    const sheet = textSheet[blockStyle];
    return {
      ...sheet,
      fontSize: fontSizePt,
      fontWeight: fontWeightUi,
    };
  }, [textSheet, blockStyle, fontSizePt, fontWeightUi]);

  const fontSizePx = useMemo(() => (fontSizePt * dpi) / 72, [dpi, fontSizePt]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    const at = Math.max(0, Math.min(initialCaretOffset, len));
    ta.setSelectionRange(at, at);
  }, [initialCaretOffset]);

  const debouncedSave = useDebouncedCallback(
    (nextText: string) => {
      updateBlocks((current) => ({
        ...current,
        blocks: current.blocks.map((b) => {
          if (b.id !== block.id || b.type !== "text") return b;
          return { ...b, text: nextText };
        }),
      }));
    },
    500,
    { maxWait: 1500 }
  );

  const debouncedPersistBlockFormatting = useDebouncedCallback(
    (args: {
      style: z.infer<typeof TextBlockSchema>["style"];
      align: z.infer<typeof TextBlockSchema>["align"];
      fontSizePt: number;
      fontWeight: "normal" | "bold";
      sheetFontSize: number;
      sheetFontWeight: "normal" | "bold";
    }) => {
      updateBlocks((current) => ({
        ...current,
        blocks: current.blocks.map((b) => {
          if (b.id !== block.id || b.type !== "text") return b;
          const next: z.infer<typeof TextBlockSchema> = {
            ...b,
            style: args.style,
            align: args.align,
          };
          if (args.fontSizePt !== args.sheetFontSize) {
            next.fontSize = args.fontSizePt;
          } else {
            delete next.fontSize;
          }
          if (args.fontWeight !== args.sheetFontWeight) {
            next.fontWeight = args.fontWeight;
          } else {
            delete next.fontWeight;
          }
          return next;
        }),
      }));
    },
    500,
    { maxWait: 1500 }
  );

  const persistBlockFormatting = useCallback(
    (args: {
      fontSizePt: number;
      fontWeight: "normal" | "bold";
      align: z.infer<typeof TextBlockSchema>["align"];
    }) => {
      const ts = document?.styleSheet.text ?? DEFAULT_STYLE_SHEET.text;
      const sh = ts[blockStyle];
      debouncedPersistBlockFormatting({
        style: blockStyle,
        fontSizePt: args.fontSizePt,
        fontWeight: args.fontWeight,
        align: args.align,
        sheetFontSize: sh.fontSize,
        sheetFontWeight: sh.fontWeight,
      });
    },
    [blockStyle, debouncedPersistBlockFormatting, document?.styleSheet.text]
  );

  const handleSyncDocumentPresetToMatch = useCallback(async () => {
    await syncDocumentTextPresetToMatch({
      style: blockStyle,
      fontSize: clampTextEditFontSizePt(fontSizePt),
      fontWeight: fontWeightUi,
    });
  }, [blockStyle, fontSizePt, fontWeightUi, syncDocumentTextPresetToMatch]);

  const handleSyncAllDocumentsPresetToMatch = useCallback(async () => {
    await syncProjectTextPresetToMatch({
      style: blockStyle,
      fontSize: clampTextEditFontSizePt(fontSizePt),
      fontWeight: fontWeightUi,
    });
  }, [blockStyle, fontSizePt, fontWeightUi, syncProjectTextPresetToMatch]);

  useEffect(() => {
    return () => {
      debouncedSave.flush();
      debouncedPersistBlockFormatting.flush();
    };
  }, [debouncedPersistBlockFormatting, debouncedSave]);

  const handleChange = useCallback(
    (nextText: string) => {
      setText(nextText);
      debouncedSave(nextText);
    },
    [debouncedSave]
  );

  const rows = useMemo(
    () =>
      textareaRowsFromPretext({
        text,
        layoutWidthPx,
        textStyle: localResolvedStyle,
        fontSizePx,
        canvasDisplayScale,
      }),
    [canvasDisplayScale, fontSizePx, layoutWidthPx, text, localResolvedStyle]
  );

  const handleToolbarClose = useCallback(() => {
    debouncedSave.flush();
    debouncedPersistBlockFormatting.flush();
    onClose();
  }, [debouncedPersistBlockFormatting, debouncedSave, onClose]);

  return (
    <div className="relative border border-primary ring-8 ring-primary/15 bg-white rounded-xl shadow-2xs">
      <EditTextToolbar
        onClose={handleToolbarClose}
        blockStyle={blockStyle}
        onTextStylePresetSelect={(style) => {
          setBlockStyle(style);
          const ts = document?.styleSheet.text ?? DEFAULT_STYLE_SHEET.text;
          const sh = ts[style];
          setFontSizePt(sh.fontSize);
          setFontWeightUi(sh.fontWeight);
          debouncedPersistBlockFormatting({
            style,
            align: alignUi,
            fontSizePt: sh.fontSize,
            fontWeight: sh.fontWeight,
            sheetFontSize: sh.fontSize,
            sheetFontWeight: sh.fontWeight,
          });
        }}
        fontSizePt={fontSizePt}
        onFontSizePtChange={setFontSizePt}
        fontWeightUi={fontWeightUi}
        onFontWeightUiChange={setFontWeightUi}
        align={alignUi}
        onAlignChange={setAlignUi}
        persistBlockFormatting={persistBlockFormatting}
        onSyncDocumentPresetToMatch={handleSyncDocumentPresetToMatch}
        onSyncAllDocumentsPresetToMatch={handleSyncAllDocumentsPresetToMatch}
        canSyncAllDocuments={projectId != null}
      />
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent rounded-xl p-2 outline-none text-black"
        style={{
          fontFamily: localResolvedStyle.fontFamily,
          fontSize: `${fontSizePx * canvasDisplayScale}px`,
          fontWeight: localResolvedStyle.fontWeight,
          lineHeight: localResolvedStyle.lineHeight,
          textAlign: alignUi,
        }}
        placeholder="Type your text here..."
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={rows}
      />
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
  const { setAction, editAction, focusAction, activeBlockId } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      editAction: selectEditBlockAction(s),
      focusAction: asFocusBlockAction(s.action),
      activeBlockId: selectActiveBlockId(s),
    }))
  );
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [initialCaretOffset, setInitialCaretOffset] = useState(0);
  const isEditingThisBlock = editAction?.blockId === block.id;
  const isFocusOnlyThisBlock =
    focusAction?.blockId === block.id && !isEditingThisBlock;
  const inFocus = isEditingThisBlock || focusAction?.blockId === block.id;
  const canvasGroupRef = useRef<Konva.Group | null>(null);
  const [canvasDisplayScale, setCanvasDisplayScale] = useState(1);

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

  /** Canvas text uses layout px × Konva absolute scale; DOM textarea fontSize must match (see `PageCanvas` layer scale). */
  useLayoutEffect(() => {
    if (!anchor || !isEditingThisBlock) return;

    const updateScale = () => {
      const node = canvasGroupRef.current;
      if (!node) return;
      const { x, y } = node.getAbsoluteScale();
      const s = x !== 0 ? x : y;
      setCanvasDisplayScale(Number.isFinite(s) && s !== 0 ? s : 1);
    };

    updateScale();

    const container = canvasGroupRef.current?.getStage()?.container() ?? null;
    const ro =
      typeof ResizeObserver !== "undefined" && container
        ? new ResizeObserver(() => updateScale())
        : null;
    if (container && ro) ro.observe(container);

    window.addEventListener("resize", updateScale);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [anchor, isEditingThisBlock]);

  const closeTextEditor = useCallback(() => {
    setAnchor(null);
    setInitialCaretOffset(0);
    setAction((current) => {
      const editAction = asEditBlockAction(current);
      if (editAction?.blockId !== block.id) return current;
      return { type: "focus-block", blockId: block.id };
    });
  }, [block.id, setAction]);

  const handleClick = useCallback(
    (args: {
      event: Konva.KonvaEventObject<MouseEvent>;
      anchor: AnchorRect;
    }) => {
      const node = canvasGroupRef.current;
      const local = node?.getRelativePointerPosition();
      const caretAtPointer =
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

      const { action } = documentStore.getState();
      const currentEdit = asEditBlockAction(action);
      const currentFocus = asFocusBlockAction(action);

      if (currentEdit?.blockId === block.id) {
        return;
      }

      if (currentFocus?.blockId === block.id) {
        setAnchor(args.anchor);
        setInitialCaretOffset(caretAtPointer);
        setAction({ type: "edit-block", blockId: block.id });
        return;
      }

      setAction({ type: "focus-block", blockId: block.id });
    },
    [
      block.align,
      block.id,
      block.text,
      dimensions.width,
      documentStore,
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

  useEffect(() => {
    if (!isFocusOnlyThisBlock) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAction((current) => {
          const f = asFocusBlockAction(current);
          return f?.blockId === block.id ? null : current;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [block.id, isFocusOnlyThisBlock, setAction]);

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
        inFocus={inFocus}
        blockHotkeyScope="focus-block-only"
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
              onClose={closeTextEditor}
              initialCaretOffset={initialCaretOffset}
              layoutWidthPx={dimensions.width}
              canvasDisplayScale={canvasDisplayScale}
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
    const sheetStyle = ctx.styleSheet.text[block.style];
    const style = {
      ...sheetStyle,
      ...(block.fontSize != null ? { fontSize: block.fontSize } : {}),
      ...(block.fontWeight != null ? { fontWeight: block.fontWeight } : {}),
    };
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
