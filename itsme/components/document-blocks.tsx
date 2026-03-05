import type { ComponentType } from "react";

type Block =
  | {
      type: "about";
      header: string;
      points: string[];
    }
  | {
      type: "bullet-list";
      header: [string, string] | null;
      points: string[];
    }
  | {
      type: "2-column-list";
      header: [string, string] | null;
      points: [string, string][];
    }
  | {
      type: "v-spacer";
      height: number;
    };

type BlockWithSection =
  | Block
  | {
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

export type LayoutParentRect = {
  width: number;
  height: number;
};

export type LayoutBlockDimensions = {
  width: number;
  height: number;
};

export type LayoutBlockComponentProps = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutBlockComponent = ComponentType<LayoutBlockComponentProps>;

export type LayoutBlockRendererResult = {
  estimatedDimensions: LayoutBlockDimensions;
  component: LayoutBlockComponent;
};

export type LayoutBlockRenderer<
  TBlock extends BlockWithSection = BlockWithSection,
> = (args: {
  document: Document;
  block: TBlock;
  parent: LayoutParentRect;
  headingOffset: number;
}) => LayoutBlockRendererResult;

export type LayoutBlockRenderers = {
  [K in BlockWithSection["type"]]: LayoutBlockRenderer<
    Extract<BlockWithSection, { type: K }>
  >;
};

export type LaidOutBlock = {
  id: number;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  component: LayoutBlockComponent;
};

export type PageLayout = {
  blocks: LaidOutBlock[];
};

const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;

const MIN_COLUMN_RATIO = 0.25;
const MAX_COLUMN_RATIO = 0.75;

function ptToPx(pt: number) {
  return (pt * CSS_PIXELS_PER_INCH) / POINTS_PER_INCH;
}

function inchToPx(inches: number) {
  return inches * CSS_PIXELS_PER_INCH;
}

export function resolveDocument(def: DocumentDefinition): Document {
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

export const DEFAULT_TEXT_STYLES: DocumentDefinition["textStyles"] = {
  default: {
    fontSize: 11,
    fontWeight: "normal",
    lineHeight: 1.2,
  },
  h1: {
    fontSize: 16,
    fontWeight: "normal",
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
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
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

let _measureCtx: CanvasRenderingContext2D | null = null;
export function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  const doc = globalThis.document;
  if (!doc) return null;
  const canvas = doc.createElement("canvas");
  _measureCtx = canvas.getContext("2d");
  return _measureCtx;
}

export function estimateLineCount(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: "normal" | "bold",
  maxWidth: number
): number {
  if (!text) return 0;

  const ctx = getMeasureCtx();
  if (!ctx) {
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

export function getHeadingStyle(
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

export function getProportionalColumnWidths(options: {
  leftText: string;
  rightText: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  totalWidth: number;
  minRatio?: number;
  maxRatio?: number;
}): { left: number; right: number } {
  const {
    leftText,
    rightText,
    fontFamily,
    fontSize,
    fontWeight,
    totalWidth,
    minRatio = MIN_COLUMN_RATIO,
    maxRatio = MAX_COLUMN_RATIO,
  } = options;

  if (totalWidth <= 0) {
    return { left: 0, right: 0 };
  }

  const ctx = getMeasureCtx();
  if (!ctx) {
    const half = totalWidth / 2;
    return { left: half, right: half };
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const rawLeft = Math.max(0, ctx.measureText(leftText).width);
  const rawRight = Math.max(0, ctx.measureText(rightText).width);
  const sumWidth = rawLeft + rawRight;

  if (sumWidth <= 0) {
    const half = totalWidth / 2;
    return { left: half, right: half };
  }

  let allocLeft = (rawLeft / sumWidth) * totalWidth;
  let allocRight = totalWidth - allocLeft;

  const minCol = totalWidth * minRatio;
  const maxCol = totalWidth * maxRatio;

  allocLeft = Math.min(maxCol, Math.max(minCol, allocLeft));
  allocRight = totalWidth - allocLeft;

  return { left: allocLeft, right: allocRight };
}

export function layoutDocument(
  document: Document,
  renderers: LayoutBlockRenderers
): PageLayout[] {
  const pages: PageLayout[] = [{ blocks: [] }];
  const { pageSize, margins, blocks } = document;

  const contentWidth = pageSize.width - margins.left - margins.right;
  const contentBottom = pageSize.height - margins.bottom;

  let currentPageIndex = 0;
  let currentY = margins.top;
  let blockSeq = 0;
  const nextBlockId = () => {
    blockSeq += 1;
    return blockSeq;
  };

  const addSpacingBelow = (blockType: BlockWithSection["type"]) => {
    const spacing = document.spacingBelow[blockType];
    if (!spacing) return;

    if (currentY + spacing > contentBottom) {
      currentPageIndex += 1;
      pages[currentPageIndex] = { blocks: [] };
      currentY = margins.top;
    } else {
      currentY += spacing;
    }
  };

  const placeAtomicBlock = (block: BlockWithSection, headingOffset: number) => {
    const renderer = renderers[
      block.type
    ] as LayoutBlockRenderer<BlockWithSection>;
    let result = renderer({
      document,
      block,
      parent: {
        width: contentWidth,
        height: Math.max(0, contentBottom - currentY),
      },
      headingOffset,
    });

    let { width, height } = result.estimatedDimensions;

    // If it doesn't fit and we're not at the top of a page, move to next page
    // and re-run the renderer with the new parent height.
    if (currentY !== margins.top && currentY + height > contentBottom) {
      currentPageIndex += 1;
      pages[currentPageIndex] = { blocks: [] };
      currentY = margins.top;

      result = renderer({
        document,
        block,
        parent: {
          width: contentWidth,
          height: Math.max(0, contentBottom - currentY),
        },
        headingOffset,
      });
      ({ width, height } = result.estimatedDimensions);
    }

    const id = nextBlockId();

    const page = pages[currentPageIndex];
    page.blocks.push({
      id,
      pageIndex: currentPageIndex,
      x: margins.left,
      y: currentY,
      width,
      height,
      component: result.component,
    });

    currentY += height;
  };

  const placeBlock = (block: BlockWithSection, headingOffset: number) => {
    if (block.type === "section") {
      // Place the section header as its own block, then place children.
      placeAtomicBlock(block, headingOffset);

      const innerBlocks = block.blocks;
      for (let i = 0; i < innerBlocks.length; i++) {
        const inner = innerBlocks[i];
        placeBlock(inner, headingOffset + 1);
        if (i < innerBlocks.length - 1) {
          addSpacingBelow(inner.type);
        }
      }
      return;
    }

    placeAtomicBlock(block, headingOffset);
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    placeBlock(block, 0);
    if (i < blocks.length - 1) {
      addSpacingBelow(block.type);
    }
  }

  return pages;
}

export type {
  Block,
  BlockWithSection,
  TextStyle,
  Document,
  DocumentDefinition,
};
