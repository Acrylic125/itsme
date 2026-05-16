import { z } from "zod";
import { BlockSchema, type Block } from "./blocks";
import { newClientBlockId } from "./apply-block-move";

export const COPY_PASTE_CLIPBOARD_ACTION = "copy-paste" as const;

function blockChildIds(b: Block): string[] {
  switch (b.type) {
    case "text":
      return [];
    case "section":
    case "list":
      return b.blocks;
    case "columns":
      return b.blocks.map((c) => c.blockId);
  }
}

/**
 * Clipboard payload: one structural root and its descendants (all `Block` rows).
 */
export const CopyPasteClipboardSchema = z
  .object({
    action: z.literal(COPY_PASTE_CLIPBOARD_ACTION),
    blocks: z.array(BlockSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const idSet = new Set<string>();
    for (const b of data.blocks) {
      if (idSet.has(b.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate block id in clipboard",
          path: ["blocks"],
        });
        return;
      }
      idSet.add(b.id);
    }

    for (let i = 0; i < data.blocks.length; i++) {
      const b = data.blocks[i]!;
      for (const cid of blockChildIds(b)) {
        if (!idSet.has(cid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Block ${b.id} references missing child ${cid}`,
            path: ["blocks", i],
          });
        }
      }
    }

    const referencedAsChild = new Set<string>();
    for (const b of data.blocks) {
      for (const cid of blockChildIds(b)) {
        referencedAsChild.add(cid);
      }
    }
    const roots = data.blocks.filter((b) => !referencedAsChild.has(b.id));
    if (roots.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          roots.length === 0
            ? "No root block (every block is referenced as a child)"
            : "Multiple root blocks in clipboard",
        path: ["blocks"],
      });
    }
  });

export type CopyPasteClipboardPayload = z.infer<
  typeof CopyPasteClipboardSchema
>;

/**
 * Copy should always export a stable anchor for text blocks so linking paste can
 * preserve it even when the source row itself has no explicit `ref`.
 */
function ensureTextRefsForClipboard(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type !== "text" || b.ref !== undefined) {
      return b;
    }
    return {
      ...b,
      ref: b.id,
    };
  });
}

/** Drop `text.ref` when it does not point at another row in the same clipboard. */
export function stripDanglingTextRefsInSubtree(blocks: Block[]): Block[] {
  const ids = new Set(blocks.map((b) => b.id));
  return blocks.map((b) => {
    if (b.type !== "text" || b.ref === undefined) {
      return b;
    }
    if (ids.has(b.ref)) {
      return b;
    }
    const { ref, ...rest } = b;
    void ref;
    return rest as Block;
  });
}

/**
 * Assign fresh client ids for a paste. By default omits `ref` on pasted blocks.
 * With `preserveRefsInSubtree`, keeps the original `ref` string unchanged so
 * linking paste preserves the source anchor across documents.
 */
export function remapCopyPasteBlocksToClientIds(
  blocks: Block[],
  options?: { preserveRefsInSubtree?: boolean }
): Block[] {
  const preserveRefs = options?.preserveRefsInSubtree ?? false;
  const oldToNew = new Map<string, string>();
  for (const b of blocks) {
    oldToNew.set(b.id, newClientBlockId(b.type));
  }
  const r = (id: string) => oldToNew.get(id) ?? id;

  const refIfPreserving = (
    ref: string | undefined
  ): { ref: string } | Record<string, never> => {
    if (!preserveRefs || ref === undefined) return {};
    return { ref };
  };

  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return {
          type: "text",
          id: r(b.id),
          text: b.text,
          align: b.align,
          style: b.style,
          ...(b.fontSize !== undefined ? { fontSize: b.fontSize } : {}),
          ...(b.fontWeight !== undefined ? { fontWeight: b.fontWeight } : {}),
          ...refIfPreserving(b.ref),
        } as Block;
      case "section":
        return {
          type: "section",
          id: r(b.id),
          blocks: b.blocks.map(r),
          ...refIfPreserving(b.ref),
        } as Block;
      case "list":
        return {
          type: "list",
          id: r(b.id),
          blocks: b.blocks.map(r),
          bullet: b.bullet,
          ...(b.leftSpace !== undefined ? { leftSpace: b.leftSpace } : {}),
          ...(b.rightSpace !== undefined ? { rightSpace: b.rightSpace } : {}),
          ...refIfPreserving(b.ref),
        } as Block;
      case "columns":
        return {
          type: "columns",
          id: r(b.id),
          blocks: b.blocks.map((c) => ({ ...c, blockId: r(c.blockId) })),
          ...refIfPreserving(b.ref),
        } as Block;
    }
  });
}

export function serializeCopyPasteClipboard(blocks: Block[]): string {
  const blocksForClipboard = ensureTextRefsForClipboard(blocks);
  const payload: CopyPasteClipboardPayload = {
    action: COPY_PASTE_CLIPBOARD_ACTION,
    blocks: blocksForClipboard,
  };
  return JSON.stringify(payload);
}

/**
 * Parses and validates clipboard JSON; returns blocks with fresh client ids
 * (root first), or null if invalid.
 * @param options.preserveRefs — when true, keeps `ref` unchanged and skips stripping dangling text refs before remap.
 */
export function parseCopyPasteClipboardPayload(
  text: string,
  options?: { preserveRefs?: boolean }
): Block[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const parsed = CopyPasteClipboardSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const preserveRefs = options?.preserveRefs ?? false;
  const blocksForRemap = preserveRefs
    ? parsed.data.blocks
    : stripDanglingTextRefsInSubtree(parsed.data.blocks);
  return remapCopyPasteBlocksToClientIds(blocksForRemap, {
    preserveRefsInSubtree: preserveRefs,
  });
}
