import { nanoid } from "nanoid";
import type { Block } from "@/blocks/blocks";
import {
  CreateProjectFromPdfInput,
  ExtendedPDFTextItemSchema,
  PDFEndMarkedContentSchema,
  TEXT_SPACER,
} from "./schema";
import { z } from "zod";

type PdfTextWithFont = z.infer<typeof ExtendedPDFTextItemSchema>;
type PdfMarkedItem =
  | (PdfTextWithFont & { type: "text" })
  | { type: "startMarkedContent" }
  | z.infer<typeof PDFEndMarkedContentSchema>;

type PageTextChunk = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  content: string;
};

type MarkedChunk = PageTextChunk & {
  tag: "H1" | "H2" | "H3" | "P" | "LI" | "SPAN";
};

type TextTag = "h1" | "h2" | "h3" | "p";

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
  tag: MarkedChunk["tag"]
): "h1" | "h2" | "h3" | "default" {
  if (tag === "H1") return "h1";
  if (tag === "H2") return "h2";
  if (tag === "H3") return "h3";
  return "default";
}

function getChunkStyleKey(chunk: PageTextChunk): string {
  return `${chunk.fontSize}`;
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
  const uniqueStyles = [...new Set(chunks.map((chunk) => getChunkStyleKey(chunk)))]
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

function groupMarkedItemsIntoChunks(args: {
  items: PdfMarkedItem[];
  pageHeight: number;
}): MarkedChunk[] {
  let activeTag: MarkedChunk["tag"] = "SPAN";
  const chunks: MarkedChunk[] = [];

  for (const item of args.items) {
    if (item.type === "beginMarkedContentProps") {
      activeTag = item.tag;
      continue;
    }
    if (item.type === "startMarkedContent") {
      activeTag = "SPAN";
      continue;
    }
    const textItem = item;

    const content = textItem.str.trim();
    if (!content) continue;
    const x = Math.round(textItem.transform[4]);
    const y = args.pageHeight - Math.round(textItem.transform[5]);
    const width = Math.max(1, Math.round(textItem.width));
    const height = Math.max(1, Math.round(textItem.height));
    const fontSize = Math.max(
      1,
      Math.round(Math.max(textItem.height, Math.abs(textItem.transform[0])))
    );

    const previous = chunks[chunks.length - 1];
    if (previous) {
      const sameLineTolerance = Math.max(previous.height, height) * 0.5;
      const sameLine = Math.abs(previous.y - y) <= sameLineTolerance;
      const previousRight = previous.x + previous.width;
      const horizontalGap = x - previousRight;
      const shouldJoin =
        previous.tag === activeTag && sameLine && horizontalGap >= -2;
      if (shouldJoin) {
        const separator =
          horizontalGap <=
          Math.max(1, Math.round(Math.min(previous.height, height) * 0.25))
            ? ""
            : TEXT_SPACER;
        previous.content = `${previous.content}${separator}${content}`;
        const mergedRight = Math.max(previousRight, x + width);
        previous.width = mergedRight - previous.x;
        previous.height = Math.max(previous.height, height);
        previous.fontSize = Math.max(previous.fontSize, fontSize);
        previous.y = Math.round((previous.y + y) / 2);
        continue;
      }
    }

    chunks.push({
      x,
      y,
      width,
      height,
      fontSize,
      content,
      tag: activeTag,
    });
  }

  return chunks;
}

function unmarkedToBlocks(
  input: Extract<CreateProjectFromPdfInput, { type: "unmarked" }>
): Block[] {
  const blocks: Block[] = [];
  for (const page of input.pages) {
    const pageHeight = page.view[3];
    const groupedItems = groupTextItemsIntoChunks({
      items: page.textItems,
      pageHeight,
    });
    const tagMap = buildChunkTagMap(groupedItems);

    for (const chunk of groupedItems) {
      const tag = tagMap.get(getChunkStyleKey(chunk)) ?? "p";
      const content = normalizeText(chunk.content);
      if (!content) continue;
      blocks.push({
        id: createBlockId(),
        type: "text",
        text: content,
        style: mapTagToStyle(tag),
        align: "left",
      });
    }
  }
  return blocks;
}

function markedToBlocks(
  input: Extract<CreateProjectFromPdfInput, { type: "marked" }>
): Block[] {
  const blocks: Block[] = [];
  const pendingListItems: string[] = [];

  const flushList = () => {
    if (pendingListItems.length === 0) return;
    blocks.push({
      id: createBlockId(),
      type: "list",
      blocks: [...pendingListItems],
      bullet: { type: "normal", value: "-" },
    });
    pendingListItems.length = 0;
  };

  for (const page of input.pages) {
    const pageHeight = page.view[3];
    const chunks = groupMarkedItemsIntoChunks({
      items: page.textItems,
      pageHeight,
    });

    for (const chunk of chunks) {
      const content = normalizeText(chunk.content);
      if (!content) continue;

      if (chunk.tag === "LI") {
        const textId = createBlockId();
        blocks.push({
          id: textId,
          type: "text",
          text: content,
          style: "default",
          align: "left",
        });
        pendingListItems.push(textId);
        continue;
      }

      flushList();
      blocks.push({
        id: createBlockId(),
        type: "text",
        text: content,
        style: mapMarkedTagToTextStyle(chunk.tag),
        align: "left",
      });
    }
  }

  flushList();
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

