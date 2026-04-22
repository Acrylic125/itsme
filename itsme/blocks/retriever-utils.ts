import db from "@/db/db";
import { blocks, documentMainLayout } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Block } from "./blocks";

export async function getDocumentMainLayout(documentId: string) {
  const mainLayoutRows = await db
    .select({
      blockId: documentMainLayout.blockId,
      orderIndex: documentMainLayout.orderIndex,
    })
    .from(documentMainLayout)
    .where(eq(documentMainLayout.documentId, documentId))
    .orderBy(asc(documentMainLayout.orderIndex));
  return mainLayoutRows;
}

export async function getDocumentBlockMappings(documentId: string) {
  const blockRows = await db
    .select({
      id: blocks.id,
      type: blocks.type,
      orderIndex: blocks.orderIndex,
    })
    .from(blocks)
    .where(eq(blocks.documentId, documentId))
    .orderBy(asc(blocks.orderIndex));
  return new Map(blockRows.map((row) => [row.id, row]));
}

export type DocumentBlockRow =
  Awaited<ReturnType<typeof getDocumentBlockMappings>> extends Map<
    string,
    infer V
  >
    ? V
    : never;

export type L1_DocumentBlockRetriever<T extends Block["type"]> = {
  type: T;
  get: (ctx: { block: DocumentBlockRow }) => Promise<
    | {
        ok: true;
        value: Extract<Block, { type: T }>;
        orderIndex: number;
      }
    | {
        ok: false;
        error: string;
      }
  >;
};

export type L1_DocumentBlockInserter<T extends Block["type"]> = {
  type: T;
  insert: (ctx: { block: Extract<Block, { type: T }> }) => Promise<void>;
};
