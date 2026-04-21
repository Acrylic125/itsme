import db from "@/db/db";
import { textBlocks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { L1_DocumentBlockRetriever } from "../retriever-utils";
import { TextBlockSchema } from "./schema";

export const TextBlockRetriever: L1_DocumentBlockRetriever<"text"> = {
  type: "text",
  async get({ block }) {
    const row = await db
      .select({
        text: textBlocks.text,
        align: textBlocks.align,
        style: textBlocks.style,
        ref: textBlocks.ref,
      })
      .from(textBlocks)
      .where(eq(textBlocks.blockId, block.id))
      .get();
    if (!row) {
      return { ok: false, error: `text block data missing: ${block.id}` };
    }

    const parsed = TextBlockSchema.safeParse({
      id: block.id,
      type: "text",
      text: row.text,
      align: row.align,
      style: row.style,
      ref: row.ref ?? undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `invalid text block ${block.id}: ${parsed.error.message}`,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      orderIndex: block.orderIndex,
    };
  },
};
