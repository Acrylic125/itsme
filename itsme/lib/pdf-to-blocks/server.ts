import { nanoid } from "nanoid";
import type { Block } from "@/blocks/blocks";
import {
  CreateProjectFromPdfInput,
  ExtendedPDFTextItemSchema,
  TEXT_SPACER,
} from "./schema";
import { z } from "zod";

type PdfTextWithFont = z.infer<typeof ExtendedPDFTextItemSchema>;
type PdfMarkedTag = "H1" | "H2" | "H3" | "P" | "LI" | "SPAN";
type PdfMarkedItem =
  | (PdfTextWithFont & { type: "text" })
  | { type: "beginMarkedContentProps"; tag: PdfMarkedTag }
  | { type: "endMarkedContent" }
  | { type: "startMarkedContent" };

type PageTextChunk = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  content: string;
};

type MarkedTextNode = {
  kind: "text";
  item: PdfTextWithFont;
};

type MarkedGroupNode = {
  kind: "group";
  tag: PdfMarkedTag | null;
  children: MarkedNode[];
};

type MarkedNode = MarkedTextNode | MarkedGroupNode;

type FlowPart =
  | {
      type: "text";
      item: PdfTextWithFont;
    }
  | {
      type: "li";
      group: MarkedGroupNode & { tag: "LI" };
    };

type PendingListItem = {
  blockId: string | null;
  bulletValue: string | null;
};

type TextTag = "h1" | "h2" | "h3" | "p";
type TextAlign = "left" | "center" | "right";

function createBlockId() {
  return `b_${nanoid(22)}`;
}

function normalizeText(raw: string) {
  return raw.replaceAll(TEXT_SPACER, " ").trim();
}

function mapTagToStyle(tag: TextTag): "h1" | "h2" | "h3" | "default" {
  if (tag === "h1") return "h1";
  if (tag === "h2") return "h2";
  if (tag === "h3") return "h3";
  return "default";
}

function mapMarkedTagToTextStyle(
  tag: PdfMarkedTag
): "h1" | "h2" | "h3" | "default" {
  if (tag === "H1") return "h1";
  if (tag === "H2") return "h2";
  if (tag === "H3") return "h3";
  return "default";
}

function getChunkStyleKey(chunk: PageTextChunk): string {
  return `${chunk.fontSize}`;
}

function getPageMetrics(view: [number, number, number, number]) {
  return {
    pageLeft: view[0],
    pageWidth: Math.max(1, view[2] - view[0]),
    pageHeight: Math.max(1, view[3] - view[1]),
  };
}

// function inferCenteredAlign(args: {
//   left: number;
//   width: number;
//   pageLeft: number;
//   pageWidth: number;
// }): TextAlign {
//   const leftGap = Math.max(0, args.left - args.pageLeft);
//   const rightGap = Math.max(0, args.pageWidth - (leftGap + args.width));
//   const balancedGapTolerance = Math.max(12, args.pageWidth * 0.03);
//   const minOuterGap = Math.max(24, args.pageWidth * 0.08);
//   const contentCenter = leftGap + args.width / 2;
//   const pageCenter = args.pageWidth / 2;

//   const isCentered =
//     leftGap >= minOuterGap &&
//     rightGap >= minOuterGap &&
//     Math.abs(leftGap - rightGap) <= balancedGapTolerance &&
//     Math.abs(contentCenter - pageCenter) <= balancedGapTolerance;

//   return isCentered ? "center" : "left";
// }
function inferCenteredAlign(args: {
  left: number;
  width: number;
  pageLeft: number;
  pageWidth: number;
}): TextAlign {
  const leftGap = Math.max(0, args.left - args.pageLeft);
  const rightGap = Math.max(0, args.pageWidth - (leftGap + args.width));
  const balancedGapTolerance = Math.max(12, args.pageWidth * 0.03);
  const minOuterGap = Math.max(24, args.pageWidth * 0.08);

  const isCentered =
    leftGap >= minOuterGap &&
    rightGap >= minOuterGap &&
    Math.abs(leftGap - rightGap) <= balancedGapTolerance;

  if (isCentered) return "center";

  const isRight = leftGap >= minOuterGap && rightGap < minOuterGap;
  if (isRight) return "right";

  return "left";
}

function getTagForRank(args: { rank: number; pairCount: number }): TextTag {
  const { rank, pairCount } = args;
  if (pairCount <= 1) return "p";
  if (pairCount === 2) return rank === 0 ? "h1" : "p";
  if (pairCount === 3) {
    if (rank === 0) return "h1";
    if (rank === 1) return "h2";
    return "p";
  }
  if (rank === 0) return "h1";
  if (rank === 1) return "h2";
  if (rank === 2) return "h3";
  return "p";
}

function buildChunkTagMap(chunks: PageTextChunk[]): Map<string, TextTag> {
  const uniqueStyles = [
    ...new Set(chunks.map((chunk) => getChunkStyleKey(chunk))),
  ]
    .map((key) => {
      return {
        key,
        fontSize: Number(key),
      };
    })
    .sort((a, b) => b.fontSize - a.fontSize);

  const pairCount = uniqueStyles.length;
  return new Map(
    uniqueStyles.map((style, index) => [
      style.key,
      getTagForRank({ rank: index, pairCount }),
    ])
  );
}

function groupTextItemsIntoChunks(args: {
  items: PdfTextWithFont[];
  pageHeight: number;
}): PageTextChunk[] {
  const normalized = args.items
    .map((item) => {
      const x = Math.round(item.transform[4]);
      const y = args.pageHeight - Math.round(item.transform[5]);
      return {
        x,
        y,
        width: Math.max(1, Math.round(item.width)),
        height: Math.max(1, Math.round(item.height)),
        fontSize: Math.max(
          1,
          Math.round(Math.max(item.height, Math.abs(item.transform[0])))
        ),
        content: item.str.trim(),
      };
    })
    .filter((item) => item.content.length > 0)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const groups: PageTextChunk[] = [];
  for (const item of normalized) {
    const previous = groups[groups.length - 1];
    if (!previous) {
      groups.push(item);
      continue;
    }

    const sameLineTolerance = Math.max(previous.height, item.height) * 0.5;
    const sameLine = Math.abs(previous.y - item.y) <= sameLineTolerance;
    const previousRight = previous.x + previous.width;
    const horizontalGap = item.x - previousRight;
    const shouldJoin = sameLine && horizontalGap >= -2;

    if (!shouldJoin) {
      groups.push(item);
      continue;
    }

    const superCloseThreshold = Math.max(
      1,
      Math.round(Math.min(previous.height, item.height) * 0.25)
    );
    const separator = horizontalGap <= superCloseThreshold ? "" : TEXT_SPACER;
    previous.content = `${previous.content}${separator}${item.content}`;
    const mergedRight = Math.max(previousRight, item.x + item.width);
    previous.width = mergedRight - previous.x;
    previous.height = Math.max(previous.height, item.height);
    previous.fontSize = Math.max(previous.fontSize, item.fontSize);
    previous.y = Math.round((previous.y + item.y) / 2);
  }

  return groups;
}

function isCloseMarkedContent(item: PdfMarkedItem): boolean {
  return item.type === "endMarkedContent" || item.type === "startMarkedContent";
}

function isListGroupNode(
  node: MarkedGroupNode
): node is MarkedGroupNode & { tag: "LI" } {
  return node.tag === "LI";
}

function buildMarkedTree(items: PdfMarkedItem[]): MarkedGroupNode {
  const root: MarkedGroupNode = {
    kind: "group",
    tag: null,
    children: [],
  };
  const stack: MarkedGroupNode[] = [root];
  let openGroupCount = 0;

  items.forEach((item, index) => {
    const currentGroup = stack[stack.length - 1];
    if (!currentGroup) {
      throw new Error("Invalid marked content tree state.");
    }

    if (item.type === "beginMarkedContentProps") {
      const nextGroup: MarkedGroupNode = {
        kind: "group",
        tag: item.tag,
        children: [],
      };
      currentGroup.children.push(nextGroup);
      stack.push(nextGroup);
      openGroupCount += 1;
      return;
    }

    if (isCloseMarkedContent(item)) {
      if (openGroupCount === 0 || stack.length === 1) {
        throw new Error(
          `Invalid marked content at item ${index}: encountered endMarkedContent without a matching beginMarkedContentProps.`
        );
      }
      stack.pop();
      openGroupCount -= 1;
      return;
    }

    if (item.type !== "text") {
      throw new Error(
        `Invalid marked content at item ${index}: unsupported marker ${item.type}.`
      );
    }

    currentGroup.children.push({
      kind: "text",
      item,
    });
  });

  while (openGroupCount > 0 && stack.length > 1) {
    stack.pop();
    openGroupCount -= 1;
  }

  if (openGroupCount !== 0 || stack.length !== 1) {
    throw new Error(
      `Invalid marked content: ${openGroupCount} group(s) were opened but not closed.`
    );
  }

  return root;
}

function flattenTextLikeNodes(nodes: MarkedNode[]): FlowPart[] {
  const parts: FlowPart[] = [];

  for (const node of nodes) {
    if (node.kind === "text") {
      parts.push({
        type: "text",
        item: node.item,
      });
      continue;
    }

    if (isListGroupNode(node)) {
      parts.push({
        type: "li",
        group: node,
      });
      continue;
    }

    parts.push(...flattenTextLikeNodes(node.children));
  }

  return parts;
}

function createTextBlock(args: {
  blocks: Block[];
  text: string;
  style: "h1" | "h2" | "h3" | "default";
  align?: TextAlign;
}): string | null {
  const content = normalizeText(args.text);
  if (!content) return null;

  const id = createBlockId();
  args.blocks.push({
    id,
    type: "text",
    text: content,
    style: args.style,
    align: args.align ?? "left",
  });
  return id;
}

function createSectionBlock(args: {
  blocks: Block[];
  childBlockIds: string[];
}): string | null {
  if (args.childBlockIds.length === 0) return null;
  if (args.childBlockIds.length === 1) return args.childBlockIds[0] ?? null;

  const id = createBlockId();
  args.blocks.push({
    id,
    type: "section",
    blocks: args.childBlockIds,
  });
  return id;
}

function createListBlock(args: {
  blocks: Block[];
  items: PendingListItem[];
}): string | null {
  const childBlockIds = args.items
    .map((item) => item.blockId)
    .filter((blockId): blockId is string => blockId != null);
  if (childBlockIds.length === 0) return null;

  const bulletValues = args.items
    .map((item) => item.bulletValue)
    .filter((value): value is string => value != null && value.length > 0);
  const uniqueBulletValues = [...new Set(bulletValues)];
  const bulletValue =
    uniqueBulletValues.length === 1 ? (uniqueBulletValues[0] ?? "-") : "-";

  const id = createBlockId();
  args.blocks.push({
    id,
    type: "list",
    blocks: childBlockIds,
    bullet: {
      type: "normal",
      value: bulletValue,
    },
  });
  return id;
}

function getTextItemBounds(item: PdfTextWithFont) {
  const x = Math.round(item.transform[4]);
  const width = Math.max(1, Math.round(item.width));
  return {
    left: x,
    right: x + width,
  };
}

function createTextOrColumnsBlock(args: {
  blocks: Block[];
  textItems: PdfTextWithFont[];
  style: "h1" | "h2" | "h3" | "default";
  pageLeft: number;
  pageWidth: number;
}): string | null {
  const segments: PdfTextWithFont[][] = [];
  let currentSegment: PdfTextWithFont[] = [];

  for (const item of args.textItems) {
    if (!item.str) continue;

    if (item.str === " ") {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    currentSegment.push(item);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) return null;

  if (segments.length === 1) {
    const bounds = segments[0]!.map(getTextItemBounds);
    const left = Math.min(...bounds.map((bound) => bound.left));
    const right = Math.max(...bounds.map((bound) => bound.right));
    const allowCentered = args.style !== "default";
    return createTextBlock({
      blocks: args.blocks,
      text: segments[0]!.map((item) => item.str).join(""),
      style: args.style,
      align: allowCentered
        ? inferCenteredAlign({
            left,
            width: Math.max(1, right - left),
            pageLeft: args.pageLeft,
            pageWidth: args.pageWidth,
          })
        : "left",
    });
  }

  const columnEntries = segments
    .map((segment, index) => {
      const blockId = createTextBlock({
        blocks: args.blocks,
        text: segment.map((item) => item.str).join(""),
        style: args.style,
        align: index === segments.length - 1 ? "right" : "left",
      });
      if (!blockId) return null;

      const bounds = segment.map(getTextItemBounds);
      const left = Math.min(...bounds.map((bound) => bound.left));
      const right = Math.max(...bounds.map((bound) => bound.right));
      return {
        blockId,
        span: Math.max(1, right - left),
      };
    })
    .filter(
      (entry): entry is { blockId: string; span: number } => entry != null
    );

  if (columnEntries.length === 0) return null;
  if (columnEntries.length === 1) return columnEntries[0]!.blockId;

  const id = createBlockId();
  args.blocks.push({
    id,
    type: "columns",
    blocks: columnEntries,
  });
  return id;
}

function emitFlowParts(args: {
  blocks: Block[];
  parts: FlowPart[];
  style: "h1" | "h2" | "h3" | "default";
  pageLeft: number;
  pageWidth: number;
}): string[] {
  const emittedBlockIds: string[] = [];
  const pendingListItems: PendingListItem[] = [];
  let pendingTextItems: PdfTextWithFont[] = [];

  const flushTextItems = () => {
    const blockId = createTextOrColumnsBlock({
      blocks: args.blocks,
      textItems: pendingTextItems,
      style: args.style,
      pageLeft: args.pageLeft,
      pageWidth: args.pageWidth,
    });
    if (blockId) {
      emittedBlockIds.push(blockId);
    }
    pendingTextItems = [];
  };

  const flushListItems = () => {
    const blockId = createListBlock({
      blocks: args.blocks,
      items: pendingListItems,
    });
    if (blockId) {
      emittedBlockIds.push(blockId);
    }
    pendingListItems.length = 0;
  };

  for (const part of args.parts) {
    if (part.type === "li") {
      flushTextItems();
      pendingListItems.push(
        emitListItem(part.group, args.blocks, args.pageLeft, args.pageWidth)
      );
      continue;
    }

    if (pendingListItems.length > 0) {
      flushListItems();
    }

    pendingTextItems.push(part.item);
  }

  flushTextItems();
  flushListItems();

  return emittedBlockIds;
}

function emitTextLikeGroup(
  group: MarkedGroupNode,
  blocks: Block[],
  pageLeft: number,
  pageWidth: number
): string | null {
  if (group.tag === null || group.tag === "LI") {
    throw new Error("emitTextLikeGroup called with a non text-like group.");
  }

  const flowParts = flattenTextLikeNodes(group.children);
  const childBlockIds = emitFlowParts({
    blocks,
    parts: flowParts,
    style: mapMarkedTagToTextStyle(group.tag),
    pageLeft,
    pageWidth,
  });

  return createSectionBlock({
    blocks,
    childBlockIds,
  });
}

function emitListItem(
  group: MarkedGroupNode & { tag: "LI" },
  blocks: Block[],
  pageLeft: number,
  pageWidth: number
): PendingListItem {
  const flowParts = flattenTextLikeNodes(group.children);
  const bodyParts: FlowPart[] = [];

  let bulletValue: string | null = null;
  let sawBullet = false;
  let maybeIgnoreNextSpacer = false;

  for (const part of flowParts) {
    if (!sawBullet && part.type === "text") {
      const normalized = normalizeText(part.item.str);
      if (!normalized) {
        continue;
      }
      bulletValue = normalized;
      sawBullet = true;
      maybeIgnoreNextSpacer = true;
      continue;
    }

    if (maybeIgnoreNextSpacer && part.type === "text") {
      maybeIgnoreNextSpacer = false;
      if (part.item.str === " ") {
        continue;
      }
    }

    bodyParts.push(part);
  }

  const childBlockIds = emitFlowParts({
    blocks,
    parts: bodyParts,
    style: "default",
    pageLeft,
    pageWidth,
  });

  return {
    blockId: createSectionBlock({
      blocks,
      childBlockIds,
    }),
    bulletValue,
  };
}

function emitMarkedNodes(
  nodes: MarkedNode[],
  blocks: Block[],
  pageLeft: number,
  pageWidth: number
) {
  const pendingListItems: PendingListItem[] = [];
  let pendingTextItems: PdfTextWithFont[] = [];

  const flushTextItems = () => {
    const blockId = createTextOrColumnsBlock({
      blocks,
      textItems: pendingTextItems,
      style: "default",
      pageLeft,
      pageWidth,
    });
    if (blockId) {
      pendingTextItems = [];
      return;
    }
    pendingTextItems = [];
  };

  const flushListItems = () => {
    const blockId = createListBlock({
      blocks,
      items: pendingListItems,
    });
    pendingListItems.length = 0;
    if (!blockId) return;
  };

  for (const node of nodes) {
    if (node.kind === "text") {
      if (pendingListItems.length > 0) {
        flushListItems();
      }
      pendingTextItems.push(node.item);
      continue;
    }

    if (isListGroupNode(node)) {
      flushTextItems();
      pendingListItems.push(emitListItem(node, blocks, pageLeft, pageWidth));
      continue;
    }

    if (pendingListItems.length > 0) {
      flushListItems();
    }
    flushTextItems();
    if (!emitTextLikeGroup(node, blocks, pageLeft, pageWidth)) {
      continue;
    }
  }

  flushTextItems();
  flushListItems();
}

function unmarkedToBlocks(
  input: Extract<CreateProjectFromPdfInput, { type: "unmarked" }>
): Block[] {
  const blocks: Block[] = [];
  for (const page of input.pages) {
    const { pageHeight, pageLeft, pageWidth } = getPageMetrics(page.view);
    const groupedItems = groupTextItemsIntoChunks({
      items: page.textItems,
      pageHeight,
    });
    const tagMap = buildChunkTagMap(groupedItems);

    for (const chunk of groupedItems) {
      const tag = tagMap.get(getChunkStyleKey(chunk)) ?? "p";
      const content = normalizeText(chunk.content);
      if (!content) continue;
      const style = mapTagToStyle(tag);
      blocks.push({
        id: createBlockId(),
        type: "text",
        text: content,
        style,
        align:
          style === "default"
            ? "left"
            : inferCenteredAlign({
                left: chunk.x,
                width: chunk.width,
                pageLeft,
                pageWidth,
              }),
      });
    }
  }
  return blocks;
}

function markedToBlocks(
  input: Extract<CreateProjectFromPdfInput, { type: "marked" }>
): Block[] {
  const blocks: Block[] = [];

  for (const page of input.pages) {
    const { pageLeft, pageWidth } = getPageMetrics(page.view);
    const root = buildMarkedTree(page.textItems as PdfMarkedItem[]);
    emitMarkedNodes(root.children, blocks, pageLeft, pageWidth);
  }

  return blocks;
}

export async function pdfToBlocks(
  input: CreateProjectFromPdfInput
): Promise<Block[]> {
  if (input.type === "marked") {
    return markedToBlocks(input);
  }
  return unmarkedToBlocks(input);
}
