"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Text, Group } from "react-konva";

type Block =
  | {
      /**
       * Equivalent to HTML:
       * <h1><center>{header}</center></h1>
       * <span>{points[0]} | {points[1]} | {points[2]} | ...</span>
       */
      type: "about";
      header: string;
      points: string[];
    }
  | {
      /**
       * Equivalent to HTML:
       * <h2>{header[0]} <spacer /> {header[1]}</h2>
       * <ul>
       *   <li>{bullet} {points[0]}</li>
       *   <li>{bullet} {points[1]}</li>
       *   <li>{bullet} {points[2]}</li>
       *   ...
       * </ul>
       */
      type: "bullet-list";
      header: [string, string] | null;
      points: string[];
    }
  | {
      /**
       * Equivalent to HTML:
       * <h2>{header[0]} <spacer /> {header[1]}</h2>
       * <ul>
       *   <li>{points[0][0]} <spacer /> {points[0][1]}</li>
       *   <li>{points[1][0]} <spacer /> {points[1][1]}</li>
       *   <li>{points[2][0]} <spacer /> {points[2][1]}</li>
       *   ...
       * </ul>
       */
      type: "2-column-list";
      header: [string, string] | null;
      points: [string, string][];
    }
  | {
      /**
       * Equivalent to HTML:
       * <div style="height: {height}px"></div>
       */
      type: "v-spacer";
      /**
       * Height in points (will be converted to px in the renderer).
       */
      height: number;
    };

type BlockWithSection =
  | Block
  | {
      /**
       * Equivalent to HTML:
       * <h2>{header[0]} <spacer /> {header[1]}</h2>
       * {blocks[0]}
       * {blocks[1]}
       * ...
       *
       * Headers in blocks within section are downgraded by 1, example h2 -> h3, h3 -> h4, etc. normal text stays the same.
       */
      type: "section";
      header: [string, string];
      blocks: Block[];
    };

type TextStyle = {
  fontSize: number;
  fontWeight: "normal" | "bold";
  /**
   * Unitless multiplier, like CSS `line-height`.
   */
  lineHeight: number;
};

type DocumentDefinition = {
  name: string;
  pageSize: {
    /**
     * US Letter is 8.5 x 11 (inches)
     */
    width: number;
    height: number;
  };
  font: "Times New Roman";
  spacingBelow: {
    [key in Extract<BlockWithSection, { type: string }>["type"]]: number;
  };
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  textStyles: {
    default: TextStyle;
    h1: TextStyle;
    h2: TextStyle;
    h3: TextStyle;
    h4: TextStyle;
  };
  bulletListStyle: {
    bullet: string;
    indent: number;
    gap: number;
  };
  blocks: BlockWithSection[];
};

type Document = Omit<
  DocumentDefinition,
  "pageSize" | "margins" | "textStyles" | "bulletListStyle" | "spacingBelow"
> & {
  pageSize: { width: number; height: number };
  margins: { top: number; bottom: number; left: number; right: number };
  textStyles: DocumentDefinition["textStyles"];
  bulletListStyle: DocumentDefinition["bulletListStyle"];
  spacingBelow: DocumentDefinition["spacingBelow"];
};

const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;

function ptToPx(pt: number) {
  return (pt * CSS_PIXELS_PER_INCH) / POINTS_PER_INCH;
}

function inchToPx(inches: number) {
  return inches * CSS_PIXELS_PER_INCH;
}

function resolveDocument(def: DocumentDefinition): Document {
  const resolveBlocks = (blocks: BlockWithSection[]): BlockWithSection[] =>
    blocks.map((b) => {
      if (b.type === "v-spacer") {
        return { ...b, height: ptToPx(b.height) };
      }
      if (b.type === "section") {
        return { ...b, blocks: resolveBlocks(b.blocks) as Block[] };
      }
      return b;
    });

  return {
    ...def,
    pageSize: {
      width: inchToPx(def.pageSize.width),
      height: inchToPx(def.pageSize.height),
    },
    margins: {
      top: ptToPx(def.margins.top),
      bottom: ptToPx(def.margins.bottom),
      left: ptToPx(def.margins.left),
      right: ptToPx(def.margins.right),
    },
    textStyles: {
      default: {
        ...def.textStyles.default,
        fontSize: ptToPx(def.textStyles.default.fontSize),
      },
      h1: {
        ...def.textStyles.h1,
        fontSize: ptToPx(def.textStyles.h1.fontSize),
      },
      h2: {
        ...def.textStyles.h2,
        fontSize: ptToPx(def.textStyles.h2.fontSize),
      },
      h3: {
        ...def.textStyles.h3,
        fontSize: ptToPx(def.textStyles.h3.fontSize),
      },
      h4: {
        ...def.textStyles.h4,
        fontSize: ptToPx(def.textStyles.h4.fontSize),
      },
    },
    bulletListStyle: {
      ...def.bulletListStyle,
      indent: ptToPx(def.bulletListStyle.indent),
      gap: ptToPx(def.bulletListStyle.gap),
    },
    spacingBelow: {
      about: ptToPx(def.spacingBelow.about),
      "bullet-list": ptToPx(def.spacingBelow["bullet-list"]),
      "2-column-list": ptToPx(def.spacingBelow["2-column-list"]),
      section: ptToPx(def.spacingBelow.section),
      "v-spacer": ptToPx(def.spacingBelow["v-spacer"]),
    },
    blocks: resolveBlocks(def.blocks),
  };
}

const DEFAULT_TEXT_STYLES: DocumentDefinition["textStyles"] = {
  default: {
    fontSize: 11,
    fontWeight: "normal",
    lineHeight: 1.2,
  },
  h1: {
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 1.2,
  },
  h2: {
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 1.2,
  },
  h3: {
    fontSize: 12,
    fontWeight: "bold",
    lineHeight: 1.2,
  },
  h4: {
    fontSize: 11,
    fontWeight: "bold",
    lineHeight: 1.2,
  },
};

export const SAMPLE_RESUME: DocumentDefinition = {
  name: "Master Resume",
  textStyles: DEFAULT_TEXT_STYLES,
  spacingBelow: {
    about: 11,
    "bullet-list": 11,
    "2-column-list": 11,
    section: 11,
    "v-spacer": 0,
  },
  pageSize: {
    // US Letter size 8.5 x 11 inches
    width: 8.5,
    height: 11,
  },
  bulletListStyle: {
    bullet: "•",
    indent: 11,
    gap: 11,
  },
  font: "Times New Roman",
  margins: {
    top: 40,
    bottom: 40,
    left: 40,
    right: 40,
  },
  blocks: [
    {
      type: "about",
      header: "John Doe",
      points: [
        "Software Engineer",
        "Full Stack Developer",
        "Github",
        "LinkedIn",
      ],
    },
    {
      type: "section",
      header: ["Education", ""],
      blocks: [
        {
          type: "2-column-list",
          header: null,
          points: [
            [
              "Nanyang Technological University | Bachelor's of Computing | cGPA 4.53",
              "August 2024 - Dec 2027",
            ],
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Experience", ""],
      blocks: [
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "ExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperienceExperience",
            "Experience 2",
            "Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3 Experience 3",
            "Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4 Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Projects", ""],
      blocks: [
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
        {
          type: "bullet-list",
          header: ["ASDF, ASDF", "Jan 2026 - Present"],
          points: [
            "Experience 1",
            "Experience 2",
            "Experience 3",
            "Experience 4",
          ],
        },
      ],
    },
    {
      type: "section",
      header: ["Achievements", ""],
      blocks: [
        {
          type: "2-column-list",
          header: null,
          points: [
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
            ["ASDF, ASDF", "Jan 2026 - Present"],
          ],
        },
      ],
    },
  ],
};

type RenderTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  lineHeight: number;
  align?: "left" | "center" | "right";
};

type PageLayout = {
  items: RenderTextItem[];
};

const PAGE_GAP = 24;

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  const doc = globalThis.document;
  if (!doc) return null;
  const canvas = doc.createElement("canvas");
  _measureCtx = canvas.getContext("2d");
  return _measureCtx;
}

function estimateLineCount(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: "normal" | "bold",
  maxWidth: number
): number {
  if (!text) return 0;

  const ctx = getMeasureCtx();
  if (!ctx) {
    // Fallback if canvas isn't available for some reason.
    const avgCharWidth = fontSize * 0.5;
    const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    return Math.max(1, Math.ceil(text.length / maxCharsPerLine));
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const spaceWidth = ctx.measureText(" ").width;

  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let currentWidth = 0;

  const placeLongWord = (word: string) => {
    for (const ch of word) {
      const w = ctx.measureText(ch).width;
      if (currentWidth === 0) {
        if (w > maxWidth) {
          // Extremely narrow maxWidth: still advance
          lines += 1;
          currentWidth = 0;
          continue;
        }
        currentWidth = w;
        continue;
      }

      if (currentWidth + w > maxWidth) {
        lines += 1;
        currentWidth = w;
      } else {
        currentWidth += w;
      }
    }
  };

  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;

    if (currentWidth === 0) {
      if (wordWidth <= maxWidth) {
        currentWidth = wordWidth;
      } else {
        placeLongWord(word);
      }
      continue;
    }

    if (currentWidth + spaceWidth + wordWidth <= maxWidth) {
      currentWidth += spaceWidth + wordWidth;
    } else {
      lines += 1;
      currentWidth = 0;
      if (wordWidth <= maxWidth) {
        currentWidth = wordWidth;
      } else {
        placeLongWord(word);
      }
    }
  }

  return lines;
}

function getHeadingStyle(
  baseLevel: 1 | 2,
  offset: number,
  textStyles: Document["textStyles"]
): TextStyle {
  const level = Math.min(4, baseLevel + offset) as 1 | 2 | 3 | 4;
  switch (level) {
    case 1:
      return textStyles.h1;
    case 2:
      return textStyles.h2;
    case 3:
      return textStyles.h3;
    case 4:
    default:
      return textStyles.h4;
  }
}

function layoutDocument(document: Document): PageLayout[] {
  const pages: PageLayout[] = [{ items: [] }];
  const { pageSize, margins, textStyles, bulletListStyle, blocks } = document;

  const contentWidth = pageSize.width - margins.left - margins.right;
  const contentBottom = pageSize.height - margins.bottom;

  let currentPageIndex = 0;
  let currentY = margins.top;

  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > contentBottom) {
      currentPageIndex += 1;
      pages[currentPageIndex] = { items: [] };
      currentY = margins.top;
    }
  };

  const addText = (
    item: Omit<RenderTextItem, "fontWeight" | "width" | "lineHeight"> & {
      fontWeight?: RenderTextItem["fontWeight"];
      width?: number;
      lineHeight?: RenderTextItem["lineHeight"];
    }
  ) => {
    const page = pages[currentPageIndex];
    page.items.push({
      fontWeight: item.fontWeight ?? "normal",
      width: item.width ?? contentWidth,
      lineHeight: item.lineHeight ?? textStyles.default.lineHeight,
      ...item,
    });
  };

  const addHeaderLine = (left: string, right: string, style: TextStyle) => {
    const colWidth = contentWidth / 2;
    const leftLines = estimateLineCount(
      left,
      document.font,
      style.fontSize,
      style.fontWeight,
      colWidth
    );
    const rightLines = estimateLineCount(
      right,
      document.font,
      style.fontSize,
      style.fontWeight,
      colWidth
    );
    const lines = Math.max(leftLines, rightLines || 1);
    const blockHeight = lines * style.fontSize * style.lineHeight;

    ensureSpace(blockHeight);

    addText({
      text: left,
      x: margins.left,
      y: currentY,
      width: colWidth,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      align: "left",
    });

    if (right) {
      addText({
        text: right,
        x: margins.left + colWidth,
        y: currentY,
        width: colWidth,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        align: "right",
      });
    }

    currentY += blockHeight;
  };

  const addSpacingBelow = (blockType: BlockWithSection["type"]) => {
    const spacing = document.spacingBelow[blockType];
    if (!spacing) return;

    // If spacing would overflow the page, start a new page instead of
    // pushing the current block down. That means the block is effectively
    // the last one on this page, so it gets no extra spacing.
    if (currentY + spacing > contentBottom) {
      currentPageIndex += 1;
      pages[currentPageIndex] = { items: [] };
      currentY = margins.top;
    } else {
      currentY += spacing;
    }
  };

  const renderBlock = (block: BlockWithSection, headingOffset: number) => {
    if (block.type === "v-spacer") {
      ensureSpace(block.height);
      currentY += block.height;
      return;
    }

    if (block.type === "about") {
      const headerStyle = getHeadingStyle(1, headingOffset, textStyles);
      const subtitleStyle = textStyles.default;
      const headerLines = estimateLineCount(
        block.header,
        document.font,
        headerStyle.fontSize,
        headerStyle.fontWeight,
        contentWidth
      );
      const headerHeight =
        headerLines * headerStyle.fontSize * headerStyle.lineHeight;
      const subtitleLine = block.points.join(" | ");
      const subtitleLines = estimateLineCount(
        subtitleLine,
        document.font,
        subtitleStyle.fontSize,
        subtitleStyle.fontWeight,
        contentWidth
      );
      const subtitleHeight =
        subtitleLines * subtitleStyle.fontSize * subtitleStyle.lineHeight;

      // Header
      ensureSpace(headerHeight);
      addText({
        text: block.header,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        fontSize: headerStyle.fontSize,
        fontWeight: headerStyle.fontWeight,
        lineHeight: headerStyle.lineHeight,
        align: "center",
      });
      currentY += headerHeight;

      // Points line
      ensureSpace(subtitleHeight);
      addText({
        text: subtitleLine,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        fontSize: subtitleStyle.fontSize,
        fontWeight: subtitleStyle.fontWeight,
        lineHeight: subtitleStyle.lineHeight,
        align: "center",
      });
      currentY += subtitleHeight;
      return;
    }

    if (block.type === "section") {
      const sectionHeaderStyle = getHeadingStyle(2, headingOffset, textStyles);
      // Section header (height handled inside addHeaderLine)
      addHeaderLine(block.header[0], block.header[1], sectionHeaderStyle);

      // Inner blocks with heading level downgraded by 1
      const innerBlocks = block.blocks;
      for (let i = 0; i < innerBlocks.length; i++) {
        const inner = innerBlocks[i];
        renderBlock(inner, headingOffset + 1);
        if (i < innerBlocks.length - 1) {
          // Only apply spacing if this inner block isn't the last within the section.
          addSpacingBelow(inner.type);
        }
      }
      return;
    }

    if (block.type === "bullet-list") {
      const headerStyle = getHeadingStyle(2, headingOffset, textStyles);
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

      // Optional header
      if (block.header) {
        addHeaderLine(block.header[0], block.header[1], headerStyle);
      }

      // Points, split across pages as needed
      for (const point of block.points) {
        const bulletX = margins.left + bulletListStyle.indent;
        const textX = bulletX + bulletListStyle.gap;
        const textWidth = contentWidth - (textX - margins.left);

        const lines = estimateLineCount(
          point,
          document.font,
          bodyStyle.fontSize,
          bodyStyle.fontWeight,
          textWidth
        );
        const height = Math.max(1, lines) * bodyLineHeight;

        ensureSpace(height);
        // Render bullet
        addText({
          text: bulletListStyle.bullet,
          x: bulletX,
          y: currentY,
          width: bulletListStyle.gap,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
        });

        // Render text with hanging indent so wrapped lines align under the text
        addText({
          text: point,
          x: textX,
          y: currentY,
          width: textWidth,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
        });
        currentY += height;
      }
      return;
    }

    if (block.type === "2-column-list") {
      const headerStyle = getHeadingStyle(2, headingOffset, textStyles);
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

      // Optional header
      if (block.header) {
        addHeaderLine(block.header[0], block.header[1], headerStyle);
      }

      // Points rendered as two columns on a single line, split across pages
      for (const [left, right] of block.points) {
        const colWidth = contentWidth / 2;
        const leftLines = estimateLineCount(
          left,
          document.font,
          bodyStyle.fontSize,
          bodyStyle.fontWeight,
          colWidth
        );
        const rightLines = estimateLineCount(
          right,
          document.font,
          bodyStyle.fontSize,
          bodyStyle.fontWeight,
          colWidth
        );
        const lines = Math.max(leftLines, rightLines || 1);
        const height = lines * bodyLineHeight;

        ensureSpace(height);

        addText({
          text: left,
          x: margins.left,
          y: currentY,
          width: colWidth,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
        });

        addText({
          text: right,
          x: margins.left + colWidth,
          y: currentY,
          width: colWidth,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "right",
        });

        currentY += height;
      }
      return;
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    renderBlock(block, 0);
    if (i < blocks.length - 1) {
      // Only apply spacing if this block isn't the last one in the document.
      // addSpacingBelow will also avoid adding spacing when a page break occurs.
      addSpacingBelow(block.type);
    }
  }

  return pages;
}

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: DocumentDefinition;
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(
        el.clientWidth || el.getBoundingClientRect().width || 0
      );
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const resolvedDocument = useMemo(() => resolveDocument(document), [document]);
  const pages = useMemo(
    () => layoutDocument(resolvedDocument),
    [resolvedDocument]
  );

  const pageWidth = resolvedDocument.pageSize.width;
  const pageHeight = resolvedDocument.pageSize.height;

  const scale =
    containerWidth != null && containerWidth > 0
      ? containerWidth / pageWidth
      : 1;

  const stageWidth = containerWidth ?? pageWidth;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {containerWidth !== null && (
        <Stage
          width={stageWidth}
          height={stageHeight}
          pixelRatio={dpi / 96}
          listening={false}
        >
          <Layer listening={false}>
            {pages.map((page, pageIndex) => {
              const yOffset = pageIndex * (pageHeight + PAGE_GAP) * scale;

              return (
                <Group
                  key={pageIndex}
                  y={yOffset}
                  scaleX={scale}
                  scaleY={scale}
                  listening={false}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={pageWidth}
                    height={pageHeight}
                    stroke="#e5e5e5"
                    fill="#ffffff"
                    cornerRadius={2}
                    perfectDrawEnabled={false}
                  />
                  {page.items.map((item, idx) => (
                    <Text
                      key={idx}
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      text={item.text}
                      fontFamily={resolvedDocument.font}
                      fontSize={item.fontSize}
                      lineHeight={item.lineHeight}
                      fontStyle={item.fontWeight === "bold" ? "bold" : "normal"}
                      align={item.align}
                      fill="#000000"
                      perfectDrawEnabled={false}
                    />
                  ))}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
