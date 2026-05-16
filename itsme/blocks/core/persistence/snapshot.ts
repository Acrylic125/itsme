import type { Id } from "@/convex/_generated/dataModel";
import type { Block } from "../../blocks";
import { DEFAULT_STYLE_SHEET, PAGE_SIZE } from "../../blocks";
import type { DocumentSchema } from "../../renderer";
import type z from "zod";
import { isClientId } from "../client-ids";

export type ClientIdMappings = {
  clientToConvex: Map<string, string>;
  convexToClient: Map<string, string>;
};

export type DocumentBlocksSnapshot = {
  document: { id: Id<"documents">; name: string };
  layout: Id<"blocks">[];
  blocks: Block[];
};

export type Document = z.infer<typeof DocumentSchema>;

export function documentBlocksSnapshotToDocument(
  snapshot: DocumentBlocksSnapshot
): Document {
  return {
    name: snapshot.document.name,
    pageSize: PAGE_SIZE,
    styleSheet: DEFAULT_STYLE_SHEET,
    blocks: snapshot.blocks,
    layout: snapshot.layout,
  };
}

/** Replace ids using `remap(id)`; unknown ids stay unchanged. */
export function remapSnapshotIds(
  snapshot: DocumentBlocksSnapshot,
  remap: (id: string) => string
): DocumentBlocksSnapshot {
  return {
    ...snapshot,
    layout: snapshot.layout.map((id) => remap(id)) as Id<"blocks">[],
    blocks: snapshot.blocks.map((block) => {
      const id = remap(block.id);
      const ref = block.ref ? remap(block.ref) : undefined;
      switch (block.type) {
        case "text":
          return { ...block, id, ...(ref ? { ref } : {}) };
        case "section":
        case "list":
          return {
            ...block,
            id,
            blocks: block.blocks.map((childId) => remap(childId)),
            ...(ref ? { ref } : {}),
          };
        case "columns":
          return {
            ...block,
            id,
            blocks: block.blocks.map((child) => ({
              ...child,
              blockId: remap(child.blockId),
            })),
            ...(ref ? { ref } : {}),
          };
      }
    }),
    document: {
      ...snapshot.document,
      id: remap(snapshot.document.id) as Id<"documents">,
    },
  };
}

/** Convex → client ids for display and for diffing against local snapshots. */
export function snapshotConvexToClient(
  snapshot: DocumentBlocksSnapshot,
  convexToClient: Map<string, string>
): DocumentBlocksSnapshot {
  if (convexToClient.size === 0) {
    return snapshot;
  }
  return remapSnapshotIds(snapshot, (id) => convexToClient.get(id) ?? id);
}

export function mapBlockIdForMutation(
  id: string,
  clientToConvex: Map<string, string>
): string {
  if (isClientId(id)) {
    return clientToConvex.get(id) ?? id;
  }
  return id;
}

export function mergeClientIdMappingRecord(
  prev: ClientIdMappings,
  record: Record<string, string>
): ClientIdMappings {
  const clientToConvex = new Map(prev.clientToConvex);
  const convexToClient = new Map(prev.convexToClient);
  for (const [clientId, convexId] of Object.entries(record)) {
    if (!isClientId(clientId)) {
      continue;
    }
    clientToConvex.set(clientId, convexId);
    convexToClient.set(convexId, clientId);
  }
  return { clientToConvex, convexToClient };
}

export function createEmptyClientIdMappings(): ClientIdMappings {
  return {
    clientToConvex: new Map(),
    convexToClient: new Map(),
  };
}
