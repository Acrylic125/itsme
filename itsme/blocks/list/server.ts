import db from "@/db/db";
import { listBlockChildren, listBlocks } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  L1_DocumentBlockInserter,
  L1_DocumentBlockRetriever,
} from "../retriever-utils";
import { ListBlockSchema } from "./schema";

export const ListBlockRetriever: L1_DocumentBlockRetriever<"list"> = {
  type: "list",
  async get({ block }) {
    const list = await db
      .select({
        bulletType: listBlocks.bulletType,
        bulletValue: listBlocks.bulletValue,
        leftSpace: listBlocks.leftSpace,
        rightSpace: listBlocks.rightSpace,
        ref: listBlocks.ref,
      })
      .from(listBlocks)
      .where(eq(listBlocks.blockId, block.id))
      .get();
    if (!list) {
      return { ok: false, error: `list block data missing: ${block.id}` };
    }

    const children = await db
      .select({
        childBlockId: listBlockChildren.childBlockId,
      })
      .from(listBlockChildren)
      .where(eq(listBlockChildren.listBlockId, block.id))
      .orderBy(asc(listBlockChildren.orderIndex));

    const bullet =
      list.bulletType === "normal"
        ? {
            type: "normal" as const,
            value: list.bulletValue ?? "-",
          }
        : ({
            type: list.bulletType,
          } as const);

    const parsed = ListBlockSchema.safeParse({
      id: block.id,
      type: "list",
      blocks: children.map((c) => c.childBlockId),
      bullet,
      leftSpace: list.leftSpace ?? undefined,
      rightSpace: list.rightSpace ?? undefined,
      ref: list.ref ?? undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `invalid list block ${block.id}: ${parsed.error.message}`,
      };
    }

    return {
      ok: true,
      value: parsed.data,
      orderIndex: block.orderIndex,
    };
  },
};

export const ListBlockInserter: L1_DocumentBlockInserter<"list"> = {
  type: "list",
  async insert({ block }) {
    await db.insert(listBlocks).values({
      blockId: block.id,
      bulletType: block.bullet.type,
      bulletValue: block.bullet.type === "normal" ? block.bullet.value : null,
      leftSpace: block.leftSpace ?? null,
      rightSpace: block.rightSpace ?? null,
      ref: block.ref ?? null,
    });

    if (block.blocks.length === 0) return;

    await db.insert(listBlockChildren).values(
      block.blocks.map((childBlockId, orderIndex) => ({
        listBlockId: block.id,
        childBlockId,
        orderIndex,
      }))
    );
  },
};
