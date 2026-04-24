import db from "@/db/db";
import { sectionBlockChildren, sectionBlocks } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  L1_DocumentBlockInserter,
  L1_DocumentBlockRetriever,
} from "../retriever-utils";
import { SectionBlockSchema } from "./schema";

export const SectionBlockRetriever: L1_DocumentBlockRetriever<"section"> = {
  type: "section",
  async get({ block }) {
    const sections = await db
      .select({
        ref: sectionBlocks.ref,
      })
      .from(sectionBlocks)
      .where(eq(sectionBlocks.blockId, block.id))
      .limit(1);
    const section = sections[0];
    if (!section) {
      return { ok: false, error: `section block data missing: ${block.id}` };
    }

    const children = await db
      .select({
        childBlockId: sectionBlockChildren.childBlockId,
      })
      .from(sectionBlockChildren)
      .where(eq(sectionBlockChildren.sectionBlockId, block.id))
      .orderBy(asc(sectionBlockChildren.orderIndex));

    const parsed = SectionBlockSchema.safeParse({
      id: block.id,
      type: "section",
      blocks: children.map((c) => c.childBlockId),
      ref: section.ref ?? undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `invalid section block ${block.id}: ${parsed.error.message}`,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      orderIndex: block.orderIndex,
    };
  },
};
