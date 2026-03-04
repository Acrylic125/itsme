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

type RenderTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: "normal" | "bold";
  lineHeight: number;
  align?: "left" | "center" | "right";
  /**
   * A text item can belong to multiple hover groups. Bounds are computed by
   * unioning all items in the same group.
   */
  hoverGroups?: string[];
  /**
   * Which hover group should be activated when hovering THIS item.
   * (Lets split-column items highlight only the hovered region.)
   */
  hoverEnterGroup?: string;
  /**
   * When true, this item should be ignored by PDF export.
   */
  skipPdf?: boolean;
};

type PageLayout = {
  items: RenderTextItem[];
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

function getProportionalColumnWidths(options: {
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

export function layoutDocument(document: Document): PageLayout[] {
  const pages: PageLayout[] = [{ items: [] }];
  const { pageSize, margins, textStyles, bulletListStyle, blocks } = document;

  const contentWidth = pageSize.width - margins.left - margins.right;
  const contentBottom = pageSize.height - margins.bottom;

  let currentPageIndex = 0;
  let currentY = margins.top;
  let blockSeq = 0;
  const nextBlockId = () => {
    blockSeq += 1;
    return blockSeq;
  };

  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > contentBottom) {
      currentPageIndex += 1;
      pages[currentPageIndex] = { items: [] };
      currentY = margins.top;
    }
  };

  const addText = (
    item: Omit<
      RenderTextItem,
      "fontWeight" | "width" | "lineHeight" | "hoverGroups" | "hoverEnterGroup"
    > & {
      fontWeight?: RenderTextItem["fontWeight"];
      width?: number;
      lineHeight?: RenderTextItem["lineHeight"];
      hoverGroups?: RenderTextItem["hoverGroups"];
      hoverEnterGroup?: RenderTextItem["hoverEnterGroup"];
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

  const addHeaderLine = (
    left: string,
    right: string,
    style: TextStyle,
    hover?: {
      allGroup?: string;
      leftGroup?: string;
      rightGroup?: string;
      leftEnterGroup?: string;
      rightEnterGroup?: string;
    }
  ) => {
    const { left: allocLeft, right: allocRight } = getProportionalColumnWidths({
      leftText: left,
      rightText: right,
      fontFamily: document.font,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      totalWidth: contentWidth,
    });

    if (allocLeft <= 0 && allocRight <= 0) {
      return;
    }

    const leftLines = estimateLineCount(
      left,
      document.font,
      style.fontSize,
      style.fontWeight,
      allocLeft
    );
    const rightLines = estimateLineCount(
      right,
      document.font,
      style.fontSize,
      style.fontWeight,
      allocRight
    );
    const lines = Math.max(leftLines, rightLines || 1);
    const blockHeight = lines * style.fontSize * style.lineHeight;

    ensureSpace(blockHeight);

    addText({
      text: left,
      x: margins.left,
      y: currentY,
      width: allocLeft,
      height: blockHeight,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      align: "left",
      hoverGroups: [hover?.allGroup, hover?.leftGroup].filter(
        Boolean
      ) as string[],
      hoverEnterGroup: hover?.leftEnterGroup,
    });

    if (right) {
      addText({
        text: right,
        x: margins.left + allocLeft,
        y: currentY,
        width: allocRight,
        fontSize: style.fontSize,
        height: blockHeight,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        align: "right",
        hoverGroups: [hover?.allGroup, hover?.rightGroup].filter(
          Boolean
        ) as string[],
        hoverEnterGroup: hover?.rightEnterGroup,
      });
    }

    currentY += blockHeight;
  };

  const addSpacingBelow = (blockType: BlockWithSection["type"]) => {
    const spacing = document.spacingBelow[blockType];
    if (!spacing) return;

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
      const aboutId = nextBlockId();
      const aboutHoverAll = `about-${aboutId}-all`;

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

      ensureSpace(headerHeight);
      addText({
        text: block.header,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        height: headerHeight,
        fontSize: headerStyle.fontSize,
        fontWeight: headerStyle.fontWeight,
        lineHeight: headerStyle.lineHeight,
        align: "center",
        hoverGroups: [aboutHoverAll],
        hoverEnterGroup: aboutHoverAll,
      });
      currentY += headerHeight;

      ensureSpace(subtitleHeight);
      addText({
        text: subtitleLine,
        x: margins.left,
        y: currentY,
        width: contentWidth,
        height: subtitleHeight,
        fontSize: subtitleStyle.fontSize,
        fontWeight: subtitleStyle.fontWeight,
        lineHeight: subtitleStyle.lineHeight,
        align: "center",
        hoverGroups: [aboutHoverAll],
        hoverEnterGroup: aboutHoverAll,
      });
      currentY += subtitleHeight;
      return;
    }

    if (block.type === "section") {
      const sectionId = nextBlockId();
      const sectionHeaderLeft = `section-${sectionId}-header-left`;
      const sectionHeaderRight = `section-${sectionId}-header-right`;

      const sectionHeaderStyle = getHeadingStyle(2, headingOffset, textStyles);
      addHeaderLine(block.header[0], block.header[1], sectionHeaderStyle, {
        leftGroup: sectionHeaderLeft,
        rightGroup: sectionHeaderRight,
        leftEnterGroup: sectionHeaderLeft,
        rightEnterGroup: sectionHeaderRight,
      });

      const innerBlocks = block.blocks;
      for (let i = 0; i < innerBlocks.length; i++) {
        const inner = innerBlocks[i];
        renderBlock(inner, headingOffset + 1);
        if (i < innerBlocks.length - 1) {
          addSpacingBelow(inner.type);
        }
      }
      return;
    }

    if (block.type === "bullet-list") {
      const listId = nextBlockId();
      const listHeaderLeft = `bullet-${listId}-header-left`;
      const listHeaderRight = `bullet-${listId}-header-right`;

      const headerStyle = getHeadingStyle(2, headingOffset, textStyles);
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

      if (block.header) {
        addHeaderLine(block.header[0], block.header[1], headerStyle, {
          leftGroup: listHeaderLeft,
          rightGroup: listHeaderRight,
          leftEnterGroup: listHeaderLeft,
          rightEnterGroup: listHeaderRight,
        });
      }

      for (let pointIndex = 0; pointIndex < block.points.length; pointIndex++) {
        const point = block.points[pointIndex];
        const pointGroup = `bullet-${listId}-point-${pointIndex}`;

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
        addText({
          text: bulletListStyle.bullet,
          x: bulletX,
          y: currentY,
          width: bulletListStyle.gap,
          height,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
          hoverGroups: [pointGroup],
          hoverEnterGroup: pointGroup,
        });

        addText({
          text: point,
          x: textX,
          y: currentY,
          width: textWidth,
          height,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
          hoverGroups: [pointGroup],
          hoverEnterGroup: pointGroup,
        });
        currentY += height;
      }
      return;
    }

    if (block.type === "2-column-list") {
      const listId = nextBlockId();
      const listHoverAll = `two-col-${listId}-all`;
      const listHeaderLeft = `two-col-${listId}-header-left`;
      const listHeaderRight = `two-col-${listId}-header-right`;

      const headerStyle = getHeadingStyle(2, headingOffset, textStyles);
      const bodyStyle = textStyles.default;
      const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

      if (block.header) {
        addHeaderLine(block.header[0], block.header[1], headerStyle, {
          allGroup: listHoverAll,
          leftGroup: listHeaderLeft,
          rightGroup: listHeaderRight,
          leftEnterGroup: listHeaderLeft,
          rightEnterGroup: listHeaderRight,
        });
      }

      for (let rowIndex = 0; rowIndex < block.points.length; rowIndex++) {
        const [left, right] = block.points[rowIndex];
        const rowLeftGroup = `two-col-${listId}-row-${rowIndex}-left`;
        const rowRightGroup = `two-col-${listId}-row-${rowIndex}-right`;

        const { left: allocLeft, right: allocRight } =
          getProportionalColumnWidths({
            leftText: left,
            rightText: right,
            fontFamily: document.font,
            fontSize: bodyStyle.fontSize,
            fontWeight: bodyStyle.fontWeight,
            totalWidth: contentWidth,
          });

        if (allocLeft <= 0 && allocRight <= 0) {
          continue;
        }

        const leftLines = estimateLineCount(
          left,
          document.font,
          bodyStyle.fontSize,
          bodyStyle.fontWeight,
          allocLeft
        );
        const rightLines = estimateLineCount(
          right,
          document.font,
          bodyStyle.fontSize,
          bodyStyle.fontWeight,
          allocRight
        );
        const lines = Math.max(leftLines, rightLines || 1);
        const height = lines * bodyLineHeight;

        ensureSpace(height);

        addText({
          text: left,
          x: margins.left,
          y: currentY,
          width: allocLeft,
          height,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "left",
          hoverGroups: [rowLeftGroup],
          hoverEnterGroup: rowLeftGroup,
        });

        addText({
          text: right,
          x: margins.left + allocLeft,
          y: currentY,
          width: allocRight,
          height,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          lineHeight: bodyStyle.lineHeight,
          align: "right",
          hoverGroups: [rowRightGroup],
          hoverEnterGroup: rowRightGroup,
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
      addSpacingBelow(block.type);
    }
  }

  return pages;
}

export type HoverGroupBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function computeHoverBounds(
  pages: PageLayout[]
): Map<string, HoverGroupBounds>[] {
  return pages.map((page) => {
    const acc = new Map<
      string,
      { minX: number; minY: number; maxX: number; maxY: number }
    >();

    for (const item of page.items) {
      const groups = item.hoverGroups ?? [];
      if (groups.length === 0) continue;

      const x1 = item.x;
      const y1 = item.y;
      const x2 = item.x + item.width;
      const y2 = item.y + item.height;

      for (const groupId of groups) {
        const prev = acc.get(groupId);
        if (!prev) {
          acc.set(groupId, { minX: x1, minY: y1, maxX: x2, maxY: y2 });
          continue;
        }
        prev.minX = Math.min(prev.minX, x1);
        prev.minY = Math.min(prev.minY, y1);
        prev.maxX = Math.max(prev.maxX, x2);
        prev.maxY = Math.max(prev.maxY, y2);
      }
    }

    const out = new Map<string, HoverGroupBounds>();
    acc.forEach((b, key) => {
      out.set(key, {
        x: b.minX,
        y: b.minY,
        width: b.maxX - b.minX,
        height: b.maxY - b.minY,
      });
    });
    return out;
  });
}

export type {
  Block,
  BlockWithSection,
  TextStyle,
  Document,
  DocumentDefinition,
  RenderTextItem,
  PageLayout,
};
