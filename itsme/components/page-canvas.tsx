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
};

type Document = {
  name: string;
  pageSize: {
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

const PIXELS_PER_INCH = 96;

const DEFAULT_TEXT_STYLES: Document["textStyles"] = {
  default: {
    fontSize: (11 * PIXELS_PER_INCH) / 72,
    fontWeight: "normal",
  },
  h1: {
    fontSize: (16 * PIXELS_PER_INCH) / 72,
    fontWeight: "bold",
  },
  h2: {
    fontSize: (14 * PIXELS_PER_INCH) / 72,
    fontWeight: "bold",
  },
  h3: {
    fontSize: (12 * PIXELS_PER_INCH) / 72,
    fontWeight: "bold",
  },
  h4: {
    fontSize: (11 * PIXELS_PER_INCH) / 72,
    fontWeight: "bold",
  },
};

export const SAMPLE_RESUME: Document = {
  name: "Master Resume",
  textStyles: DEFAULT_TEXT_STYLES,
  spacingBelow: {
    about: (11 * PIXELS_PER_INCH) / 72,
    "bullet-list": (11 * PIXELS_PER_INCH) / 72,
    "2-column-list": (11 * PIXELS_PER_INCH) / 72,
    section: (11 * PIXELS_PER_INCH) / 72,
  },
  pageSize: {
    // US Letter size 8.5 x 11 inches
    // Assume 96 DPI
    width: 816,
    height: 1056,
  },
  bulletListStyle: {
    bullet: "•",
    indent: (11 * PIXELS_PER_INCH) / 72,
    gap: (11 * PIXELS_PER_INCH) / 72,
  },
  font: "Times New Roman",
  margins: {
    top: (40 * PIXELS_PER_INCH) / 72,
    bottom: (40 * PIXELS_PER_INCH) / 72,
    left: (40 * PIXELS_PER_INCH) / 72,
    right: (40 * PIXELS_PER_INCH) / 72,
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
  align?: "left" | "center" | "right";
};

type PageLayout = {
  items: RenderTextItem[];
};

const LINE_HEIGHT_MULTIPLIER = 1.2;
const PAGE_GAP = 24;

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
    item: Omit<RenderTextItem, "fontWeight" | "width"> & {
      fontWeight?: RenderTextItem["fontWeight"];
      width?: number;
    }
  ) => {
    const page = pages[currentPageIndex];
    page.items.push({
      fontWeight: item.fontWeight ?? "normal",
      width: item.width ?? contentWidth,
      ...item,
    });
  };

  const addHeaderLine = (
    left: string,
    right: string,
    y: number,
    style: TextStyle
  ) => {
    const lineHeight = style.fontSize * LINE_HEIGHT_MULTIPLIER;
    ensureSpace(lineHeight);

    addText({
      text: left,
      x: margins.left,
      y: currentY,
      width: contentWidth,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      align: "left",
    });

    if (right) {
      addText({
        text: right,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        align: "right",
      });
    }

    currentY += lineHeight;
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
    if (block.type === "about") {
      const headerStyle = getHeadingStyle(1, headingOffset, textStyles);
      const headerHeight = headerStyle.fontSize * LINE_HEIGHT_MULTIPLIER;
      const subtitleStyle = textStyles.default;
      const subtitleHeight = subtitleStyle.fontSize * LINE_HEIGHT_MULTIPLIER;

      // Header
      ensureSpace(headerHeight);
      addText({
        text: block.header,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        fontSize: headerStyle.fontSize,
        fontWeight: headerStyle.fontWeight,
        align: "center",
      });
      currentY += headerHeight;

      // Points line
      const line = block.points.join(" | ");
      ensureSpace(subtitleHeight);
      addText({
        text: line,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        fontSize: subtitleStyle.fontSize,
        fontWeight: subtitleStyle.fontWeight,
        align: "center",
      });
      currentY += subtitleHeight;
      return;
    }

    if (block.type === "section") {
      const sectionHeaderStyle = getHeadingStyle(2, headingOffset, textStyles);
      const sectionHeaderHeight =
        sectionHeaderStyle.fontSize * LINE_HEIGHT_MULTIPLIER;

      // Section header
      ensureSpace(sectionHeaderHeight);
      addHeaderLine(
        block.header[0],
        block.header[1],
        currentY,
        sectionHeaderStyle
      );

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
      const headerHeight = headerStyle.fontSize * LINE_HEIGHT_MULTIPLIER;
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * LINE_HEIGHT_MULTIPLIER;

      // Optional header
      if (block.header) {
        ensureSpace(headerHeight);
        addHeaderLine(block.header[0], block.header[1], currentY, headerStyle);
      }

      // Points, split across pages as needed
      for (const point of block.points) {
        ensureSpace(bodyLineHeight);
        addText({
          text: `${bulletListStyle.bullet} ${point}`,
          x: margins.left + bulletListStyle.indent,
          y: currentY,
          width: contentWidth - bulletListStyle.indent,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          align: "left",
        });
        currentY += bodyLineHeight;
      }
      return;
    }

    if (block.type === "2-column-list") {
      const headerStyle = getHeadingStyle(2, headingOffset, textStyles);
      const headerHeight = headerStyle.fontSize * LINE_HEIGHT_MULTIPLIER;
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * LINE_HEIGHT_MULTIPLIER;

      // Optional header
      if (block.header) {
        ensureSpace(headerHeight);
        addHeaderLine(block.header[0], block.header[1], currentY, headerStyle);
      }

      // Points rendered as two columns on a single line, split across pages
      for (const [left, right] of block.points) {
        ensureSpace(bodyLineHeight);

        addText({
          text: left,
          x: margins.left,
          y: currentY,
          width: contentWidth,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          align: "left",
        });

        addText({
          text: right,
          x: margins.left,
          y: currentY,
          width: contentWidth,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          align: "right",
        });

        currentY += bodyLineHeight;
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

export function PageCanvas({ document }: { document: Document }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(el.clientWidth || document.pageSize.width);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [document.pageSize.width]);

  const pages = useMemo(() => layoutDocument(document), [document]);

  const pageWidth = document.pageSize.width;
  const pageHeight = document.pageSize.height;

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
        <Stage width={stageWidth} height={stageHeight}>
          <Layer>
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
                  />
                  {page.items.map((item, idx) => (
                    <Text
                      key={idx}
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      text={item.text}
                      fontFamily={document.font}
                      fontSize={item.fontSize}
                      fontStyle={item.fontWeight === "bold" ? "bold" : "normal"}
                      align={item.align}
                      fill="#000000"
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
