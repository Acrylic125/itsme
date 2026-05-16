import { z } from "zod";
import { BlockSchema, type Block } from "./blocks";
import { newClientBlockId, remapClientBlockIds } from "./core/client-ids";
import { getChildBlockIds, getStructuralRootBlocks } from "./core/graph";

export const COPY_PASTE_CLIPBOARD_ACTION = "copy-paste" as const;

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
          code: "custom",
          message: "Duplicate block id in clipboard",
          path: ["blocks"],
        });
        return;
      }
      idSet.add(b.id);
    }

    for (let i = 0; i < data.blocks.length; i++) {
      const b = data.blocks[i]!;
      for (const cid of getChildBlockIds(b)) {
        if (!idSet.has(cid)) {
          ctx.addIssue({
            code: "custom",
            message: `Block ${b.id} references missing child ${cid}`,
            path: ["blocks", i],
          });
        }
      }
    }

    const roots = getStructuralRootBlocks(data.blocks);
    if (roots.length !== 1) {
      ctx.addIssue({
        code: "custom",
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
  return remapClientBlockIds(blocks, (id) => oldToNew.get(id) ?? id, {
    preserveRefs,
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
