import type { Id } from "@/convex/_generated/dataModel";
import type { Block } from "./blocks";
import { isClientId } from "./core/client-ids";
import {
  clientBlockToConvexData,
  remapConvexBlockRowData,
  type ConvexBlockRowData,
} from "./core/persistence/convex-codec";
import {
  documentBlocksSnapshotToDocument,
  mapBlockIdForMutation,
  type Document,
  type DocumentBlocksSnapshot,
} from "./core/persistence/snapshot";

type BlockSyncAction =
  | { type: "create" | "update"; block: Block }
  | { type: "delete"; blockId: string };

function areBlocksEqual(a: Block, b: Block): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildDocumentBlockDiff(
  serverDocument: Document,
  document: Document
): BlockSyncAction[] {
  const serverBlocksById = new Map(serverDocument.blocks.map((b) => [b.id, b]));
  const blocksById = new Map(document.blocks.map((b) => [b.id, b]));

  const createOrUpdate: BlockSyncAction[] = [];
  for (const block of document.blocks) {
    const serverBlock = serverBlocksById.get(block.id);
    if (!serverBlock) {
      createOrUpdate.push({ type: "create", block });
      continue;
    }
    if (!areBlocksEqual(serverBlock, block)) {
      createOrUpdate.push({ type: "update", block });
    }
  }

  const deletes: BlockSyncAction[] = serverDocument.blocks
    .filter((serverBlock) => !blocksById.has(serverBlock.id))
    .map((serverBlock) => ({
      type: "delete" as const,
      blockId: serverBlock.id,
    }));

  return [...createOrUpdate, ...deletes];
}

export function layoutPatchIfChanged(
  serverLayout: Id<"blocks">[],
  modifiedLayout: Id<"blocks">[]
): Id<"blocks">[] | undefined {
  if (serverLayout.length !== modifiedLayout.length) {
    return modifiedLayout as Id<"blocks">[];
  }
  for (let i = 0; i < serverLayout.length; i++) {
    if (serverLayout[i] !== modifiedLayout[i]) {
      return modifiedLayout as Id<"blocks">[];
    }
  }
  return undefined;
}

type UpdateDocumentBlocksAction =
  | { type: "create"; clientId?: string; data: ConvexBlockRowData }
  | { type: "update"; blockId: Id<"blocks">; data: ConvexBlockRowData }
  | { type: "delete"; blockId: Id<"blocks"> };

export function blockSyncActionsToMutationActions(
  actions: BlockSyncAction[],
  clientToConvex: Map<string, string>
): UpdateDocumentBlocksAction[] {
  const out: UpdateDocumentBlocksAction[] = [];
  for (const action of actions) {
    if (action.type === "delete") {
      out.push({
        type: "delete",
        blockId: mapBlockIdForMutation(
          action.blockId,
          clientToConvex
        ) as Id<"blocks">,
      });
      continue;
    }
    const data = remapConvexBlockRowData(
      clientBlockToConvexData(action.block),
      (id) => mapBlockIdForMutation(id, clientToConvex)
    );
    if (action.type === "create") {
      out.push({
        type: "create",
        ...(isClientId(action.block.id) ? { clientId: action.block.id } : {}),
        data,
      });
    } else {
      out.push({
        type: "update",
        blockId: mapBlockIdForMutation(
          action.block.id,
          clientToConvex
        ) as Id<"blocks">,
        data,
      });
    }
  }
  return out;
}

export { documentBlocksSnapshotToDocument };
