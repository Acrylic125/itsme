import db from "@/db/db";
import { columnsBlockChildren, columnsBlocks } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { L1_DocumentBlockRetriever } from "../retriever-utils";
import { ColumnsBlockSchema } from "./schema";

export const ColumnsBlockRetriever: L1_DocumentBlockRetriever<"columns"> = {
  type: "columns",
  async get({ block }) {
    const columns = await db
      .select({
        ref: columnsBlocks.ref,
      })
      .from(columnsBlocks)
      .where(eq(columnsBlocks.blockId, block.id))
      .get();
    if (!columns) {
      return { ok: false, error: `columns block data missing: ${block.id}` };
    }

    const children = await db
      .select({
        childBlockId: columnsBlockChildren.childBlockId,
        span: columnsBlockChildren.span,
      })
      .from(columnsBlockChildren)
      .where(eq(columnsBlockChildren.columnsBlockId, block.id))
      .orderBy(asc(columnsBlockChildren.orderIndex));

    const parsed = ColumnsBlockSchema.safeParse({
      id: block.id,
      type: "columns",
      blocks: children.map((c) => ({ span: c.span, blockId: c.childBlockId })),
      ref: columns.ref ?? undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `invalid columns block ${block.id}: ${parsed.error.message}`,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      orderIndex: block.orderIndex,
    };
  },
};
