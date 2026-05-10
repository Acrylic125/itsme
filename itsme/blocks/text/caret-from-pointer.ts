import {
  layoutWithLines,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  measureCanvas ??= document.createElement("canvas");
  return measureCanvas.getContext("2d");
}

/** UTF-16 index in full source text for a layout cursor (pretext segments). */
function layoutCursorToUtf16Index(
  prepared: PreparedTextWithSegments,
  cursor: LayoutCursor
): number {
  let utf16 = 0;
  const { segments } = prepared;
  for (let s = 0; s < cursor.segmentIndex; s++) {
    utf16 += segments[s]!.length;
  }
  const seg = segments[cursor.segmentIndex] ?? "";
  if (cursor.graphemeIndex <= 0) {
    return utf16;
  }
  const segmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });
  let g = 0;
  for (const { segment } of segmenter.segment(seg)) {
    if (g >= cursor.graphemeIndex) break;
    utf16 += segment.length;
    g++;
  }
  return utf16;
}

/** Closest UTF-16 offset within `lineText` to horizontal offset `targetX` (px). */
function utf16OffsetWithinLine(lineText: string, targetX: number, font: string): number {
  if (lineText.length === 0 || targetX <= 0) return 0;
  const ctx = getMeasureContext();
  if (!ctx) return 0;
  ctx.font = font;
  const fullW = ctx.measureText(lineText).width;
  if (targetX >= fullW) return lineText.length;

  let lo = 0;
  let hi = lineText.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const w = ctx.measureText(lineText.slice(0, mid)).width;
    if (w <= targetX) lo = mid;
    else hi = mid - 1;
  }

  const atLo = lo;
  const atHi = Math.min(lineText.length, lo + 1);
  const wLo = ctx.measureText(lineText.slice(0, atLo)).width;
  const wHi = ctx.measureText(lineText.slice(0, atHi)).width;
  return Math.abs(wHi - targetX) < Math.abs(wLo - targetX) ? atHi : atLo;
}

export function caretOffsetFromLocalPoint(args: {
  text: string;
  widthPx: number;
  fontSizePx: number;
  /** Style multiplier (same as `layout(..., lineHeight)` in pretext). */
  lineHeight: number;
  fontFamily: string;
  fontWeight: string;
  align: "left" | "center" | "right";
  localX: number;
  localY: number;
}): number {
  const font = `${args.fontWeight} ${args.fontSizePx}px ${args.fontFamily}`;
  const prepared = prepareWithSegments(args.text, font);
  const { lines } = layoutWithLines(prepared, args.widthPx, args.lineHeight);
  if (lines.length === 0) return 0;

  const lineHeightPx = args.fontSizePx * args.lineHeight;
  let lineIndex = Math.floor(args.localY / lineHeightPx);
  lineIndex = Math.max(0, Math.min(lineIndex, lines.length - 1));

  const line = lines[lineIndex]!;
  const lineStartGlobal = layoutCursorToUtf16Index(prepared, line.start);

  const originX =
    args.align === "center"
      ? (args.widthPx - line.width) / 2
      : args.align === "right"
        ? args.widthPx - line.width
        : 0;
  const xInLine = args.localX - originX;
  const clampedX = Math.max(0, xInLine);

  const withinLine = utf16OffsetWithinLine(line.text, clampedX, font);
  return Math.min(args.text.length, lineStartGlobal + withinLine);
}

function expandNonWhitespaceRun(
  text: string,
  offset: number
): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };
  let lo = Math.min(Math.max(offset, 0), text.length - 1);
  let hi = offset;

  if (/\s/.test(text[lo] ?? "")) {
    let i = offset;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i < text.length) {
      lo = i;
      hi = i;
    } else {
      let j = Math.min(offset, text.length - 1);
      while (j >= 0 && /\s/.test(text[j]!)) j--;
      if (j < 0) return { start: offset, end: offset };
      lo = hi = j;
    }
  }

  while (lo > 0 && /\S/.test(text[lo - 1]!)) lo--;
  while (hi < text.length && /\S/.test(text[hi]!)) hi++;
  return { start: lo, end: hi };
}

/**
 * UTF-16 range for double-click “word” selection (prefers `Intl.Segmenter`
 * word segments when available).
 */
export function wordUtf16RangeAt(
  text: string,
  utf16Offset: number
): { start: number; end: number } {
  if (text.length === 0) return { start: 0, end: 0 };

  const o = Math.min(Math.max(utf16Offset, 0), text.length);
  const probeIndex = o === text.length ? text.length - 1 : o;

  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

    for (const seg of segmenter.segment(text)) {
      const start = seg.index;
      const end = start + seg.segment.length;
      const inSeg =
        (o >= start && o < end) ||
        (o === text.length && end === text.length && start <= o);
      if (!inSeg) continue;
      if (seg.isWordLike) return { start, end };
      break;
    }

    let best: { start: number; end: number } | null = null;
    let bestDist = Infinity;
    for (const seg of segmenter.segment(text)) {
      if (!seg.isWordLike) continue;
      const start = seg.index;
      const end = start + seg.segment.length;
      const mid = (start + end) / 2;
      const d = Math.abs(mid - probeIndex);
      if (d < bestDist) {
        bestDist = d;
        best = { start, end };
      }
    }
    if (best) return best;
  } catch {
    // fall through
  }

  return expandNonWhitespaceRun(text, probeIndex);
}
