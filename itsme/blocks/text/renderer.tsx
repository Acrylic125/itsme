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
  documentActionOf,
  selectActiveBlockId,
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
import type { Id } from "@/convex/_generated/dataModel";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "zustand/react";
import { Html } from "react-konva-utils";
import { useDebouncedCallback } from "use-debounce";
import { caretOffsetFromLocalPoint } from "./caret-from-pointer";
import { EditTextToolbar, clampTextEditFontSizePt } from "./edit-text-toolbar";
import type { PdfDrawSurface } from "../pdf/pdf-draw-context-types";
import type {
  BlockRenderLayoutResult,
  BlockRendererContext,
} from "../renderer-types";
import { mapTextStyleToPdfTag } from "../pdf/types";

/** Shown only when `block.text` is empty; not persisted and not used as edit initial value. */
const EMPTY_TEXT_DISPLAY = "Click to set text";

/** Tailwind `p-2`: horizontal padding (left + right) in CSS px, converted to layout px via `canvasDisplayScale`. */
const TEXTAREA_PADDING_X_CSS_PX = 16;

/** Konva `Text` and `<textarea>` break on `\n`; pretext defaults collapse newlines (`white-space: normal`). */
const PRETEXT_PREPARE_OPTIONS = { whiteSpace: "pre-wrap" as const };

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
    `${textStyle.fontWeight} ${fontSizePx}px ${textStyle.fontFamily}`,
    PRETEXT_PREPARE_OPTIONS
  );
  const { lineCount } = layout(prepared, wrapWidthPx, textStyle.lineHeight);
  return Math.max(1, lineCount);
}

export function EditTextModal({
  block,
  initialCaretOffset,
  layoutWidthPx,
  localResolvedStyle,
  alignUi,
  /** Konva cumulative scale (e.g. `Layer` fit-to-container); DOM CSS px must match this for parity with canvas text. */
  canvasDisplayScale = 1,
}: {
  block: z.infer<typeof TextBlockSchema>;
  initialCaretOffset: number;
  layoutWidthPx: number;
  localResolvedStyle: z.infer<typeof TextStyleSchema>;
  alignUi: z.infer<typeof TextBlockSchema>["align"];
  canvasDisplayScale?: number;
}) {
  const { updateBlocks, dpi } = useDocument();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(block.text);

  const fontSizePx = useMemo(
    () => (localResolvedStyle.fontSize * dpi) / 72,
    [dpi, localResolvedStyle.fontSize]
  );

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
      let previousText: string | undefined;
      updateBlocks(
        (current) => {
          const existing = current.blocks.find(
            (b) => b.id === block.id && b.type === "text"
          );
          if (existing?.type === "text") {
            previousText = existing.text;
          }
          return {
            ...current,
            blocks: current.blocks.map((b) => {
              if (b.id !== block.id || b.type !== "text") return b;
              return { ...b, text: nextText };
            }),
          };
        },
        {
          down: () => {
            if (previousText === undefined) return;
            updateBlocks((current) => ({
              ...current,
              blocks: current.blocks.map((b) => {
                if (b.id !== block.id || b.type !== "text") return b;
                return { ...b, text: previousText! };
              }),
            }));
          },
        }
      );
    },
    500,
    { maxWait: 1500 }
  );

  useEffect(() => {
    return () => {
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

  return (
    <div className="relative border border-primary ring-8 ring-primary/15 bg-white rounded-xl shadow-2xs">
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
  const {
    documentStore,
    blockTree,
    updateBlocks,
    document,
    syncDocumentTextPresetToMatch,
    syncProjectTextPresetToMatch,
    projectId,
  } = useDocument();
  const {
    setAction,
    editAction,
    focusAction,
    activeBlockId,
    clientIdMappings,
  } = useStore(
    documentStore,
    useShallow((s) => ({
      setAction: s.setAction,
      editAction: documentActionOf(s.action, "edit-block"),
      focusAction: documentActionOf(s.action, "focus-block"),
      activeBlockId: selectActiveBlockId(s),
      clientIdMappings: s.clientIdMappings,
    }))
  );
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [initialCaretOffset, setInitialCaretOffset] = useState(0);
  /** Bumps when toolbar content preset is applied so the edit modal remounts with fresh `block.text`. */
  const [editTextModalNonce, setEditTextModalNonce] = useState(0);
  const isEditingThisBlock = editAction?.blockId === block.id;
  const isFocusOnlyThisBlock =
    focusAction?.blockId === block.id && !isEditingThisBlock;
  const inFocus = isEditingThisBlock || focusAction?.blockId === block.id;
  const canvasGroupRef = useRef<Konva.Group | null>(null);
  const [canvasDisplayScale, setCanvasDisplayScale] = useState(1);
  const textSheet = document?.styleSheet.text ?? DEFAULT_STYLE_SHEET.text;
  const resolvedFontSizePt = clampTextEditFontSizePt(
    block.fontSize ?? textSheet[block.style].fontSize
  );
  const resolvedFontWeightUi =
    block.fontWeight ?? textSheet[block.style].fontWeight;
  const [formattingDraft, setFormattingDraft] = useState<{
    blockStyle: z.infer<typeof TextBlockSchema>["style"];
    fontSizePt: number;
    fontWeightUi: "normal" | "bold";
    alignUi: z.infer<typeof TextBlockSchema>["align"];
  } | null>(null);

  const blockStyle = formattingDraft?.blockStyle ?? block.style;
  const fontSizePt = formattingDraft?.fontSizePt ?? resolvedFontSizePt;
  const fontWeightUi = formattingDraft?.fontWeightUi ?? resolvedFontWeightUi;
  const alignUi = formattingDraft?.alignUi ?? block.align;

  const updateFormattingDraft = useCallback(
    (
      patch: Partial<{
        blockStyle: z.infer<typeof TextBlockSchema>["style"];
        fontSizePt: number;
        fontWeightUi: "normal" | "bold";
        alignUi: z.infer<typeof TextBlockSchema>["align"];
      }>
    ) => {
      setFormattingDraft((current) => ({
        blockStyle: current?.blockStyle ?? block.style,
        fontSizePt: current?.fontSizePt ?? resolvedFontSizePt,
        fontWeightUi: current?.fontWeightUi ?? resolvedFontWeightUi,
        alignUi: current?.alignUi ?? block.align,
        ...patch,
      }));
    },
    [block.align, block.style, resolvedFontSizePt, resolvedFontWeightUi]
  );

  const localResolvedStyle = useMemo(() => {
    const sheet = textSheet[blockStyle];
    return {
      ...sheet,
      fontSize: clampTextEditFontSizePt(fontSizePt),
      fontWeight: fontWeightUi,
    };
  }, [textSheet, blockStyle, fontSizePt, fontWeightUi]);

  const debouncedPersistBlockFormatting = useDebouncedCallback(
    (args: {
      style: z.infer<typeof TextBlockSchema>["style"];
      align: z.infer<typeof TextBlockSchema>["align"];
      fontSizePt: number;
      fontWeight: "normal" | "bold";
      sheetFontSize: number;
      sheetFontWeight: "normal" | "bold";
    }) => {
      const fontSizePtSafe = clampTextEditFontSizePt(args.fontSizePt);
      const argsSafe = { ...args, fontSizePt: fontSizePtSafe };
      let prevFields: {
        style: z.infer<typeof TextBlockSchema>["style"];
        align: z.infer<typeof TextBlockSchema>["align"];
        fontSize: number | undefined;
        fontWeight: "normal" | "bold" | undefined;
      } | null = null;

      updateBlocks(
        (current) => {
          const currentBlock = current.blocks.find(
            (x) => x.id === block.id && x.type === "text"
          );
          if (!currentBlock || currentBlock.type !== "text") return current;
          prevFields = {
            style: currentBlock.style,
            align: currentBlock.align,
            fontSize: currentBlock.fontSize,
            fontWeight: currentBlock.fontWeight,
          };
          return {
            ...current,
            blocks: current.blocks.map((existingBlock) => {
              if (
                existingBlock.id !== block.id ||
                existingBlock.type !== "text"
              ) {
                return existingBlock;
              }
              const next: z.infer<typeof TextBlockSchema> = {
                ...existingBlock,
                style: argsSafe.style,
                align: argsSafe.align,
              };
              if (argsSafe.fontSizePt !== argsSafe.sheetFontSize) {
                next.fontSize = argsSafe.fontSizePt;
              } else {
                delete next.fontSize;
              }
              if (argsSafe.fontWeight !== argsSafe.sheetFontWeight) {
                next.fontWeight = argsSafe.fontWeight;
              } else {
                delete next.fontWeight;
              }
              return next;
            }),
          };
        },
        {
          down: () => {
            if (!prevFields) return;
            const previousFields = prevFields;
            updateBlocks((current) => ({
              ...current,
              blocks: current.blocks.map((existingBlock) => {
                if (
                  existingBlock.id !== block.id ||
                  existingBlock.type !== "text"
                ) {
                  return existingBlock;
                }
                const next: z.infer<typeof TextBlockSchema> = {
                  ...existingBlock,
                  style: previousFields.style,
                  align: previousFields.align,
                };
                if (previousFields.fontSize !== undefined) {
                  next.fontSize = previousFields.fontSize;
                } else {
                  delete next.fontSize;
                }
                if (previousFields.fontWeight !== undefined) {
                  next.fontWeight = previousFields.fontWeight;
                } else {
                  delete next.fontWeight;
                }
                return next;
              }),
            }));
          },
        }
      );
    },
    500,
    { maxWait: 1500 }
  );

  useEffect(() => {
    return () => {
      debouncedPersistBlockFormatting.flush();
    };
  }, [debouncedPersistBlockFormatting]);

  const persistBlockFormatting = useCallback(
    (args: {
      fontSizePt: number;
      fontWeight: "normal" | "bold";
      align: z.infer<typeof TextBlockSchema>["align"];
    }) => {
      const sh = textSheet[blockStyle];
      debouncedPersistBlockFormatting({
        style: blockStyle,
        fontSizePt: args.fontSizePt,
        fontWeight: args.fontWeight,
        align: args.align,
        sheetFontSize: sh.fontSize,
        sheetFontWeight: sh.fontWeight,
      });
    },
    [blockStyle, debouncedPersistBlockFormatting, textSheet]
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

  const convexDocumentId = document
    ? (document as unknown as { id: Id<"documents"> }).id
    : null;

  const convexBlockIdForContentPresets = useMemo(() => {
    if (block.id.startsWith("CLIENT_ID:")) {
      const resolved = clientIdMappings.clientToConvex.get(block.id);
      return resolved ? (resolved as Id<"blocks">) : null;
    }
    return block.id as Id<"blocks">;
  }, [block.id, clientIdMappings]);

  const handleContentPresetSelect = useCallback(
    (nextText: string) => {
      updateBlocks((current) => ({
        ...current,
        blocks: current.blocks.map((b) =>
          b.id === block.id && b.type === "text" ? { ...b, text: nextText } : b
        ),
      }));
      setEditTextModalNonce((n) => n + 1);
    },
    [block.id, updateBlocks]
  );

  useLayoutEffect(() => {
    if (!inFocus || anchor) return;
    const syncAnchor = () => {
      const node = canvasGroupRef.current;
      if (!node) return;
      const rect = getNormalizedAnchorRectForKonvaNode(node);
      if (rect) setAnchor(rect);
    };
    syncAnchor();
    const frame = requestAnimationFrame(syncAnchor);
    return () => cancelAnimationFrame(frame);
  }, [anchor, block.id, inFocus]);

  /** Canvas text uses layout px × Konva absolute scale; DOM textarea fontSize must match (see `PageCanvas` layer scale). */
  useLayoutEffect(() => {
    if (!anchor || !inFocus) return;

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
  }, [anchor, inFocus]);

  const closeTextEditor = useCallback(() => {
    setAnchor(null);
    setInitialCaretOffset(0);
    setAction((current) => {
      const editAction = documentActionOf(current, "edit-block");
      if (editAction?.blockId !== block.id) return current;
      return { type: "focus-block", blockId: block.id };
    });
  }, [block.id, setAction]);

  const closeTextFocus = useCallback(() => {
    debouncedPersistBlockFormatting.flush();
    setFormattingDraft(null);
    setAnchor(null);
    setInitialCaretOffset(0);
    setAction((current) => {
      const edit = documentActionOf(current, "edit-block");
      if (edit?.blockId === block.id) {
        return null;
      }
      const focus = documentActionOf(current, "focus-block");
      return focus?.blockId === block.id ? null : current;
    });
  }, [block.id, debouncedPersistBlockFormatting, setAction]);

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
      const currentEdit = documentActionOf(action, "edit-block");
      const currentFocus = documentActionOf(action, "focus-block");

      if (currentEdit?.blockId === block.id) {
        return;
      }

      if (currentFocus?.blockId === block.id) {
        setAnchor(args.anchor);
        setInitialCaretOffset(caretAtPointer);
        setAction({ type: "edit-block", blockId: block.id });
        return;
      }

      setAnchor(args.anchor);
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
        event.preventDefault();
        closeTextEditor();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [anchor, isEditingThisBlock, closeTextEditor]);

  useEffect(() => {
    if (!isFocusOnlyThisBlock) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setAction((current) => {
          const f = documentActionOf(current, "focus-block");
          return f?.blockId === block.id ? null : current;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
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
        {anchor && inFocus && (
          <Html
            transform={false}
            divProps={{
              style: {
                position: "absolute",
                top: anchor.top * 100 + "%",
                left: anchor.left * 100 + "%",
                width: anchor.width * 100 + "%",
              },
            }}
          >
            <div className="relative h-0 w-full">
              <EditTextToolbar
                block={block}
                onClose={closeTextFocus}
                blockStyle={blockStyle}
                onTextStylePresetSelect={(nextStyle) => {
                  const sh = textSheet[nextStyle];
                  updateFormattingDraft({
                    blockStyle: nextStyle,
                    fontSizePt: sh.fontSize,
                    fontWeightUi: sh.fontWeight,
                  });
                  persistBlockFormatting({
                    align: alignUi,
                    fontSizePt: sh.fontSize,
                    fontWeight: sh.fontWeight,
                  });
                }}
                convexDocumentId={convexDocumentId}
                convexBlockId={convexBlockIdForContentPresets}
                onContentPresetSelect={handleContentPresetSelect}
                fontSizePt={fontSizePt}
                onFontSizePtCommit={(nextFontSizePt) => {
                  updateFormattingDraft({ fontSizePt: nextFontSizePt });
                }}
                fontWeightUi={fontWeightUi}
                onFontWeightUiChange={(nextWeight) =>
                  updateFormattingDraft({ fontWeightUi: nextWeight })
                }
                align={alignUi}
                onAlignChange={(nextAlign) =>
                  updateFormattingDraft({ alignUi: nextAlign })
                }
                persistBlockFormatting={persistBlockFormatting}
                onSyncDocumentPresetToMatch={handleSyncDocumentPresetToMatch}
                onSyncAllDocumentsPresetToMatch={
                  handleSyncAllDocumentsPresetToMatch
                }
                canSyncAllDocuments={projectId != null}
              />
            </div>
          </Html>
        )}
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
              key={`${block.id}-${editTextModalNonce}`}
              block={block}
              initialCaretOffset={initialCaretOffset}
              layoutWidthPx={dimensions.width}
              localResolvedStyle={localResolvedStyle}
              alignUi={alignUi}
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

function renderTextBlockPdf(
  block: z.infer<typeof TextBlockSchema>,
  ctx: BlockRendererContext,
  pdf: PdfDrawSurface,
  layout: BlockRenderLayoutResult
) {
  if (block.text === "") {
    return;
  }

  const sheetStyle = ctx.styleSheet.text[block.style];
  const style = {
    ...sheetStyle,
    ...(block.fontSize != null
      ? { fontSize: clampTextEditFontSizePt(block.fontSize) }
      : {}),
    ...(block.fontWeight != null ? { fontWeight: block.fontWeight } : {}),
  };

  pdf.drawWrappedText({
    xPx: layout.estimatedDimensions.x,
    yPx: layout.estimatedDimensions.y,
    widthPx: layout.estimatedDimensions.width,
    text: block.text,
    style,
    align: block.align,
    tag: pdf.shouldApplyTextMark() ? mapTextStyleToPdfTag(block.style) : null,
  });
}

export const TextBlockRenderer: BlockRenderer<"text"> = {
  type: "text",
  render: (block, relativeTo, ctx) => {
    const sheetStyle = ctx.styleSheet.text[block.style];
    const style = {
      ...sheetStyle,
      ...(block.fontSize != null
        ? { fontSize: clampTextEditFontSizePt(block.fontSize) }
        : {}),
      ...(block.fontWeight != null ? { fontWeight: block.fontWeight } : {}),
    };
    // Text styles are authored in points; renderer layout works in canvas pixels.
    const fontSizePx = (style.fontSize * ctx.dpi) / 72;
    const layoutSourceText =
      block.text === "" ? EMPTY_TEXT_DISPLAY : block.text;
    const prepared = prepare(
      layoutSourceText,
      `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`,
      PRETEXT_PREPARE_OPTIONS
    );
    const { lineCount } = layout(prepared, relativeTo.width, style.lineHeight);

    const dimensions = {
      x: 0,
      y: 0,
      width: relativeTo.width,
      height: lineCount * fontSizePx * style.lineHeight,
    };

    const pos = ctx.claimBlockSpace(dimensions.height);
    dimensions.x = pos.canvas.from.x;
    dimensions.y = pos.canvas.from.y;

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
  renderPdf: renderTextBlockPdf,
};
