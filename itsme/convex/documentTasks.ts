import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

import { Block, DEFAULT_STYLE_SHEET, StyleSheetSchema } from "../blocks/blocks";
import { isClientId } from "../blocks/core/client-ids";
import { convexDataToClientBlock } from "../blocks/core/persistence/convex-codec";
import { TextStyleSheetSchema } from "../blocks/text/schema";
import { pdfToBlocks } from "../lib/pdf-to-blocks/server";
import { CreateProjectFromPdfInputSchema } from "@/lib/pdf-to-blocks/schema";
import type { z } from "zod";

const textStyle = v.union(
  v.literal("default"),
  v.literal("h1"),
  v.literal("h2"),
  v.literal("h3")
);

const textAlign = v.union(
  v.literal("left"),
  v.literal("center"),
  v.literal("right")
);

const listBulletType = v.union(
  v.literal("normal"),
  v.literal("alphabetical"),
  v.literal("numerical")
);

const blockIdLike = v.string();

export const blockDataValidator = v.union(
  v.object({
    type: v.literal("text"),
    text: v.string(),
    align: textAlign,
    style: textStyle,
    fontSize: v.optional(v.float64()),
    fontWeight: v.optional(v.union(v.literal("normal"), v.literal("bold"))),
    ref: v.optional(v.id("blocks")),
  }),
  v.object({
    type: v.literal("section"),
    children: v.array(v.id("blocks")),
    ref: v.optional(v.id("blocks")),
  }),
  v.object({
    type: v.literal("columns"),
    children: v.array(
      v.object({
        span: v.number(),
        blockId: v.id("blocks"),
      })
    ),
    ref: v.optional(v.id("blocks")),
  }),
  v.object({
    type: v.literal("list"),
    children: v.array(v.id("blocks")),
    bulletType: listBulletType,
    bulletValue: v.optional(v.string()),
    leftSpace: v.optional(v.float64()),
    rightSpace: v.optional(v.float64()),
    ref: v.optional(v.id("blocks")),
  })
);

// Same shape as `blockDataValidator`, but accepts client-generated ids as strings.
const blockDataWithClientIdsValidator = v.union(
  v.object({
    type: v.literal("text"),
    text: v.string(),
    align: textAlign,
    style: textStyle,
    fontSize: v.optional(v.float64()),
    fontWeight: v.optional(v.union(v.literal("normal"), v.literal("bold"))),
    ref: v.optional(blockIdLike),
  }),
  v.object({
    type: v.literal("section"),
    children: v.array(blockIdLike),
    ref: v.optional(blockIdLike),
  }),
  v.object({
    type: v.literal("columns"),
    children: v.array(
      v.object({
        span: v.number(),
        blockId: blockIdLike,
      })
    ),
    ref: v.optional(blockIdLike),
  }),
  v.object({
    type: v.literal("list"),
    children: v.array(blockIdLike),
    bulletType: listBulletType,
    bulletValue: v.optional(v.string()),
    leftSpace: v.optional(v.float64()),
    rightSpace: v.optional(v.float64()),
    ref: v.optional(blockIdLike),
  })
);

function collectReferencedIdsFromBlockData(
  data: (typeof blockDataWithClientIdsValidator)["type"]
): string[] {
  if (data.type === "text") return data.ref ? [data.ref] : [];
  if (data.type === "section" || data.type === "list") {
    return [...data.children, ...(data.ref ? [data.ref] : [])];
  }
  return [
    ...data.children.map((c) => c.blockId),
    ...(data.ref ? [data.ref] : []),
  ];
}

function remapBlockDataClientIds(args: {
  data: (typeof blockDataWithClientIdsValidator)["type"];
  idMap: Map<string, Id<"blocks">>;
}): (typeof blockDataValidator)["type"] {
  const remap = (id: string | undefined): Id<"blocks"> | undefined => {
    if (!id) return undefined;
    if (isClientId(id)) {
      const mapped = args.idMap.get(id);
      if (!mapped) {
        throw new Error(`Unresolved client id '${id}'.`);
      }
      return mapped;
    }
    return id as Id<"blocks">;
  };

  if (args.data.type === "text") {
    const d = args.data;
    return {
      type: "text",
      text: d.text,
      align: d.align,
      style: d.style,
      ref: remap(d.ref),
      ...(d.fontSize !== undefined ? { fontSize: d.fontSize } : {}),
      ...(d.fontWeight !== undefined ? { fontWeight: d.fontWeight } : {}),
    };
  }
  if (args.data.type === "section") {
    return {
      type: "section",
      children: args.data.children.map((id) => remap(id)!) as Id<"blocks">[],
      ref: remap(args.data.ref),
    };
  }
  if (args.data.type === "columns") {
    return {
      type: "columns",
      children: args.data.children.map((c) => ({
        span: c.span,
        blockId: remap(c.blockId)!,
      })),
      ref: remap(args.data.ref),
    };
  }
  return {
    type: "list",
    children: args.data.children.map((id) => remap(id)!) as Id<"blocks">[],
    bulletType: args.data.bulletType,
    bulletValue: args.data.bulletValue,
    leftSpace: args.data.leftSpace,
    rightSpace: args.data.rightSpace,
    ref: remap(args.data.ref),
  };
}

async function requireIdentity(ctx: {
  auth: { getUserIdentity: () => Promise<unknown | null> };
}) {
  void ctx;
  // const identity = await ctx.auth.getUserIdentity();
  // if (!identity) {
  //   throw new Error("Not authenticated.");
  // }
  // return identity;
}

function getProjectNameFromImportedBlocks(args: {
  blocks: Array<{ type: string; text?: string; style?: string }>;
}) {
  const titleBlock = args.blocks.find(
    (b) => b.type === "text" && b.style === "h1" && typeof b.text === "string"
  );
  if (!titleBlock?.text) return "Imported Resume";
  return titleBlock.text.slice(0, 80) || "Imported Resume";
}

function collectChildIdsFromImportedBlock(block: {
  type: string;
  blocks?: unknown;
}): string[] {
  if (block.type === "section" || block.type === "list") {
    return Array.isArray(block.blocks) ? (block.blocks as string[]) : [];
  }
  if (block.type === "columns") {
    const entries = Array.isArray(block.blocks) ? block.blocks : [];
    return entries
      .map((e) =>
        typeof e === "object" && e ? (e as { blockId?: string }).blockId : null
      )
      .filter((id): id is string => typeof id === "string");
  }
  return [];
}

function getMainLayoutImportedBlockIds(
  blockList: Array<{ id: string; type: string; blocks?: unknown }>
) {
  const referenced = new Set<string>();
  for (const block of blockList) {
    for (const childId of collectChildIdsFromImportedBlock(block)) {
      referenced.add(childId);
    }
  }
  return blockList.map((b) => b.id).filter((id) => !referenced.has(id));
}

function mapBlockDataIds(args: {
  data: (typeof blockDataValidator)["type"];
  idMap: Map<Id<"blocks">, Id<"blocks">>;
}): (typeof blockDataValidator)["type"] {
  const mapId = (id: Id<"blocks"> | undefined): Id<"blocks"> | undefined =>
    id ? args.idMap.get(id) : undefined;

  const d = args.data as { type: string };
  if (d.type === "text") {
    const data = args.data as Extract<
      (typeof blockDataValidator)["type"],
      { type: "text" }
    >;
    return {
      ...data,
      ref: mapId(data.ref),
    };
  }
  if (d.type === "section") {
    const data = args.data as Extract<
      (typeof blockDataValidator)["type"],
      { type: "section" }
    >;
    return {
      ...data,
      children: data.children.map((id) => args.idMap.get(id) ?? id),
      ref: mapId(data.ref),
    };
  }
  if (d.type === "columns") {
    const data = args.data as Extract<
      (typeof blockDataValidator)["type"],
      { type: "columns" }
    >;
    return {
      ...data,
      children: data.children.map((c) => ({
        ...c,
        blockId: args.idMap.get(c.blockId) ?? c.blockId,
      })),
      ref: mapId(data.ref),
    };
  }
  const data = args.data as Extract<
    (typeof blockDataValidator)["type"],
    { type: "list" }
  >;
  return {
    ...data,
    children: data.children.map((id) => args.idMap.get(id) ?? id),
    ref: mapId(data.ref),
  };
}

/**
 * Like `mapBlockDataIds`, but for document duplication: when the source **text**
 * block had no `ref`, the copy sets `ref` to the **source** block's id (`oldBlockId`)
 * so variants stay tied to the original row across documents.
 */
function mapBlockDataForDuplicate(args: {
  oldBlockId: Id<"blocks">;
  data: (typeof blockDataValidator)["type"];
  idMap: Map<Id<"blocks">, Id<"blocks">>;
}): (typeof blockDataValidator)["type"] {
  const mapped = mapBlockDataIds({ data: args.data, idMap: args.idMap });
  // if (mapped.type !== "text") return mapped;
  // const orig = args.data;
  // if (orig.type !== "text" || orig.ref !== undefined) return mapped;
  return { ...mapped, ref: args.data.ref ?? args.oldBlockId };
}

type StyleSheet = z.infer<typeof StyleSheetSchema>;

/** Maps a Convex block row to the client `Block` union. */
export function convexBlockToClientBlock(row: Doc<"blocks">): Block {
  return convexDataToClientBlock({ id: row._id, data: row.data });
}

function mapStylesFromDocumentRows(args: {
  pageStyles: {
    gap: number;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  } | null;
  textStyles: Array<{
    style: "default" | "h1" | "h2" | "h3";
    fontSize: number;
    fontWeight: "normal" | "bold";
    fontFamily: string;
    lineHeight: number;
  }>;
  listStyles: { leftSpace: number; rightSpace: number } | null;
}): StyleSheet {
  const textStyles = JSON.parse(
    JSON.stringify(DEFAULT_STYLE_SHEET.text)
  ) as z.infer<typeof TextStyleSheetSchema>;

  for (const style of args.textStyles) {
    textStyles[style.style] = {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily,
      lineHeight: style.lineHeight,
    };
  }

  return {
    page: args.pageStyles
      ? {
          gap: args.pageStyles.gap,
          margins: {
            top: args.pageStyles.marginTop,
            bottom: args.pageStyles.marginBottom,
            left: args.pageStyles.marginLeft,
            right: args.pageStyles.marginRight,
          },
        }
      : DEFAULT_STYLE_SHEET.page,
    text: textStyles,
    list: args.listStyles
      ? {
          leftSpace: args.listStyles.leftSpace,
          rightSpace: args.listStyles.rightSpace,
        }
      : DEFAULT_STYLE_SHEET.list,
  };
}

export const getDocumentBlocks = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    const blockRows = await ctx.db
      .query("blocks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    const blocks = blockRows.map((row) => convexBlockToClientBlock(row));

    return {
      document: {
        id: document._id,
        name: document.name,
      },
      layout: [...document.layout],
      blocks,
    };
  },
});

/**
 * Text blocks whose `ref` points at the same anchor (`_id`) share a content-variant group.
 * Loads all blocks in the document's project, then returns distinct `text` values for that group.
 */
export const getTextBlockContentVariants = query({
  args: {
    documentId: v.id("documents"),
    blockId: v.id("blocks"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const row = await ctx.db.get(args.blockId);
    if (!row || row.documentId !== args.documentId) {
      return { variants: [] as string[] };
    }

    const d = row.data;
    if (d.type !== "text") {
      return { variants: [] as string[] };
    }

    const documentRecord = await ctx.db.get(args.documentId);
    if (!documentRecord) {
      return { variants: [] as string[] };
    }

    const projectDocuments = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) =>
        q.eq("projectId", documentRecord.projectId)
      )
      .collect();

    const blockRows = (
      await Promise.all(
        projectDocuments.map((doc) =>
          ctx.db
            .query("blocks")
            .withIndex("by_documentId", (q) => q.eq("documentId", doc._id))
            .collect()
        )
      )
    ).flat();

    const currentBlock = blockRows.find((b) => b._id === args.blockId);
    if (!currentBlock || currentBlock.data.type !== "text") {
      return { variants: [] as string[] };
    }

    const texts: string[] = [];
    for (const b of blockRows) {
      const data = b.data;
      if (data.type !== "text") continue;
      if (
        !(
          currentBlock.data.ref === b._id ||
          (b.data.ref !== undefined && b.data.ref === currentBlock.data.ref) ||
          currentBlock._id === b.data.ref
        )
      )
        continue;
      texts.push(data.text);
    }

    const variants = new Set<string>();
    for (const t of texts) {
      variants.add(t);
    }
    variants.delete(currentBlock.data.text);

    return { variants: Array.from(variants) };
  },
});

export const getDocumentStyles = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    const [pageRow, listRow, textRows] = await Promise.all([
      ctx.db
        .query("documentPageStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentListStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentTextStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .collect(),
    ]);

    const styleSheet = mapStylesFromDocumentRows({
      pageStyles: pageRow
        ? {
            gap: pageRow.gap,
            marginTop: pageRow.marginTop,
            marginBottom: pageRow.marginBottom,
            marginLeft: pageRow.marginLeft,
            marginRight: pageRow.marginRight,
          }
        : null,
      textStyles: textRows.map((r) => ({
        style: r.style,
        fontSize: r.fontSize,
        fontWeight: r.fontWeight,
        fontFamily: r.fontFamily,
        lineHeight: r.lineHeight,
      })),
      listStyles: listRow
        ? {
            leftSpace: listRow.leftSpace,
            rightSpace: listRow.rightSpace,
          }
        : null,
    });

    return {
      document: {
        id: document._id,
        name: document.name,
      },
      styleSheet,
    };
  },
});

export const getProjectDocuments = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const masterDocumentId =
      (
        await ctx.db
          .query("projectMasterDocuments")
          .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
          .first()
      )?.documentId ?? null;

    return {
      documents: docs.map((d) => ({ id: d._id, name: d.name })),
      masterDocumentId,
    };
  },
});

const MOCK_USER_ID = "USER";

export const getUserProjects = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx);

    const rows = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", MOCK_USER_ID))
      .collect();

    const masterRows = await Promise.all(
      rows.map((p) =>
        ctx.db
          .query("projectMasterDocuments")
          .withIndex("by_projectId", (q) => q.eq("projectId", p._id))
          .first()
      )
    );
    const masterByProjectId = new Map(
      masterRows
        .filter((r) => r != null)
        .map((r) => [r!.projectId, r!.documentId] as const)
    );

    return {
      projects: rows
        .map((p) => ({
          id: p._id,
          name: p.name,
          masterDocumentId: masterByProjectId.get(p._id) ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const getProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }
    if (project.userId !== MOCK_USER_ID) {
      throw new Error("Project not found.");
    }
    return {
      project: { id: project._id, name: project.name },
    };
  },
});

export const duplicateDocument = mutation({
  args: {
    projectId: v.id("projects"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const sourceDocument = await ctx.db.get(args.documentId);
    if (!sourceDocument || sourceDocument.projectId !== args.projectId) {
      throw new Error("Document not found.");
    }

    const sourceBlocks = await ctx.db
      .query("blocks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();

    const duplicatedDocumentId = await ctx.db.insert("documents", {
      name: `${sourceDocument.name} Copy`,
      projectId: args.projectId,
      layout: [],
    });
    await ctx.db.insert("projectMasterDocuments", {
      projectId: args.projectId,
      documentId: duplicatedDocumentId,
    });

    // 1) Create a new block for every source block (placeholder refs/children).
    const newIdByOldId = new Map<Id<"blocks">, Id<"blocks">>();
    const originalDataByOldId = new Map<
      Id<"blocks">,
      (typeof blockDataValidator)["type"]
    >();

    for (const b of sourceBlocks) {
      originalDataByOldId.set(b._id, b.data);

      const placeholderData = (() => {
        if (b.data.type === "text") {
          return {
            type: "text" as const,
            text: b.data.text,
            align: b.data.align,
            style: b.data.style,
            ...(b.data.fontSize !== undefined
              ? { fontSize: b.data.fontSize }
              : {}),
            ...(b.data.fontWeight !== undefined
              ? { fontWeight: b.data.fontWeight }
              : {}),
          };
        }
        if (b.data.type === "section") {
          return {
            type: "section" as const,
            children: [],
          };
        }
        if (b.data.type === "columns") {
          return {
            type: "columns" as const,
            children: [],
          };
        }
        return {
          type: "list" as const,
          children: [],
          bulletType: b.data.bulletType,
          bulletValue: b.data.bulletValue,
          leftSpace: b.data.leftSpace,
          rightSpace: b.data.rightSpace,
        };
      })();

      const newId = await ctx.db.insert("blocks", {
        documentId: duplicatedDocumentId,
        data: placeholderData,
      });
      newIdByOldId.set(b._id, newId);
    }

    // 2) Patch every new block with correctly remapped refs/children.
    for (const [oldId, newId] of newIdByOldId) {
      const originalData = originalDataByOldId.get(oldId);
      if (!originalData) continue;
      await ctx.db.patch(newId, {
        data: mapBlockDataForDuplicate({
          oldBlockId: oldId,
          data: originalData,
          idMap: newIdByOldId,
        }),
      });
    }

    // 3) Patch layout with mapped ids.
    const nextLayout = sourceDocument.layout.map(
      (oldBlockId) => newIdByOldId.get(oldBlockId) ?? oldBlockId
    );
    await ctx.db.patch(duplicatedDocumentId, { layout: nextLayout });

    // 4) Duplicate styles (if present).
    const [pageStyle, listStyle, textStyles] = await Promise.all([
      ctx.db
        .query("documentPageStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentListStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentTextStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .collect(),
    ]);

    if (pageStyle) {
      await ctx.db.insert("documentPageStyles", {
        documentId: duplicatedDocumentId,
        gap: pageStyle.gap,
        marginTop: pageStyle.marginTop,
        marginBottom: pageStyle.marginBottom,
        marginLeft: pageStyle.marginLeft,
        marginRight: pageStyle.marginRight,
      });
    }

    if (listStyle) {
      await ctx.db.insert("documentListStyles", {
        documentId: duplicatedDocumentId,
        leftSpace: listStyle.leftSpace,
        rightSpace: listStyle.rightSpace,
      });
    }

    for (const ts of textStyles) {
      await ctx.db.insert("documentTextStyles", {
        documentId: duplicatedDocumentId,
        style: ts.style,
        fontSize: ts.fontSize,
        fontWeight: ts.fontWeight,
        fontFamily: ts.fontFamily,
        lineHeight: ts.lineHeight,
      });
    }

    return {
      documentId: duplicatedDocumentId,
      documentName: `${sourceDocument.name} Copy`,
    };
  },
});

export const deleteDocument = mutation({
  args: {
    projectId: v.id("projects"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.projectId !== args.projectId) {
      throw new Error("Document not found.");
    }

    const masterDocumentId =
      (
        await ctx.db
          .query("projectMasterDocuments")
          .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
          .first()
      )?.documentId ?? null;

    if (masterDocumentId === doc._id) {
      throw new Error("Master resume cannot be deleted.");
    }

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const b of blocks) {
      await ctx.db.delete(b._id);
    }

    // Delete styles.
    const [pageStyle, listStyle, textStyles] = await Promise.all([
      ctx.db
        .query("documentPageStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentListStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .first(),
      ctx.db
        .query("documentTextStyles")
        .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
        .collect(),
    ]);
    if (pageStyle) await ctx.db.delete(pageStyle._id);
    if (listStyle) await ctx.db.delete(listStyle._id);
    for (const ts of textStyles) await ctx.db.delete(ts._id);

    await ctx.db.delete(args.documentId);

    const fallback = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    return {
      deletedDocumentId: args.documentId,
      nextDocumentId: fallback?._id ?? null,
    };
  },
});

export const updateDocumentBlocks = mutation({
  args: {
    documentId: v.id("documents"),
    layout: v.optional(v.array(blockIdLike)),
    actions: v.array(
      v.union(
        v.object({
          type: v.literal("create"),
          clientId: v.optional(v.string()),
          data: blockDataWithClientIdsValidator,
        }),
        v.object({
          type: v.literal("update"),
          blockId: blockIdLike,
          data: blockDataWithClientIdsValidator,
        }),
        v.object({
          type: v.literal("delete"),
          blockId: blockIdLike,
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    if (args.actions.length === 0 && !args.layout) {
      return {
        created: 0,
        updated: 0,
        deleted: 0,
        createdBlockIds: [] as Id<"blocks">[],
        clientIdToBlockId: {} as Record<string, Id<"blocks">>,
      };
    }

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found.");

    const createdBlockIds: Id<"blocks">[] = [];
    const clientIdToBlockId = new Map<string, Id<"blocks">>();
    let created = 0;
    let updated = 0;
    let deleted = 0;

    const creates = args.actions.filter(
      (a): a is Extract<(typeof args.actions)[number], { type: "create" }> =>
        a.type === "create"
    );
    const updates = args.actions.filter(
      (a): a is Extract<(typeof args.actions)[number], { type: "update" }> =>
        a.type === "update"
    );
    const deletes = args.actions.filter(
      (a): a is Extract<(typeof args.actions)[number], { type: "delete" }> =>
        a.type === "delete"
    );

    // Insert create actions in dependency order (parents before children) so
    // any client ids referenced by children are mapped first.
    const pendingCreates = creates.slice();
    while (pendingCreates.length > 0) {
      const before = pendingCreates.length;

      for (let i = pendingCreates.length - 1; i >= 0; i--) {
        const action = pendingCreates[i]!;
        const referenced = collectReferencedIdsFromBlockData(
          action.data
        ).filter((id) => isClientId(id));
        const unresolved = referenced.filter(
          (cid) => !clientIdToBlockId.has(cid)
        );
        if (unresolved.length > 0) continue;

        const mappedData = remapBlockDataClientIds({
          data: action.data,
          idMap: clientIdToBlockId,
        });

        const id = await ctx.db.insert("blocks", {
          documentId: args.documentId,
          data: mappedData,
        });
        createdBlockIds.push(id);
        created += 1;

        if (action.clientId && isClientId(action.clientId)) {
          clientIdToBlockId.set(action.clientId, id);
        }

        pendingCreates.splice(i, 1);
      }

      if (pendingCreates.length === before) {
        const sample = pendingCreates
          .slice(0, 3)
          .map((c) => c.clientId ?? "(missing clientId)");
        throw new Error(
          `Could not resolve create dependencies for client ids: ${sample.join(
            ", "
          )}`
        );
      }
    }

    for (const action of updates) {
      const mappedBlockId = isClientId(action.blockId)
        ? clientIdToBlockId.get(action.blockId)
        : (action.blockId as Id<"blocks">);
      if (!mappedBlockId) {
        throw new Error(`Unresolved client id '${action.blockId}' for update.`);
      }

      const block = await ctx.db.get(mappedBlockId);
      if (!block || block.documentId !== args.documentId) {
        throw new Error("updateDocumentBlocks only supports one document.");
      }

      await ctx.db.patch(mappedBlockId, {
        data: remapBlockDataClientIds({
          data: action.data,
          idMap: clientIdToBlockId,
        }),
      });
      updated += 1;
    }

    for (const action of deletes) {
      const mappedBlockId = isClientId(action.blockId)
        ? clientIdToBlockId.get(action.blockId)
        : (action.blockId as Id<"blocks">);
      if (!mappedBlockId) {
        throw new Error(`Unresolved client id '${action.blockId}' for delete.`);
      }

      const block = await ctx.db.get(mappedBlockId);
      if (!block || block.documentId !== args.documentId) {
        throw new Error("updateDocumentBlocks only supports one document.");
      }
      await ctx.db.delete(mappedBlockId);
      deleted += 1;
    }

    let mappedLayoutAfterMutation: Id<"blocks">[] | undefined;
    if (args.layout) {
      mappedLayoutAfterMutation = args.layout.map((id) => {
        if (!isClientId(id)) return id as Id<"blocks">;
        const mapped = clientIdToBlockId.get(id);
        if (!mapped) throw new Error(`Unresolved client id '${id}' in layout.`);
        return mapped;
      });
      await ctx.db.patch(args.documentId, {
        layout: mappedLayoutAfterMutation,
      });
    }
    // Do not append created rows to `layout` when `layout` is omitted. Nested
    // creates (e.g. text inside a list) only update parent block data; the
    // client intentionally skips `layout` when the root order is unchanged.

    const clientIdToBlockIdRecord: Record<string, Id<"blocks">> = {};
    for (const [clientId, blockId] of clientIdToBlockId) {
      clientIdToBlockIdRecord[clientId] = blockId;
    }

    return {
      created,
      updated,
      deleted,
      createdBlockIds,
      clientIdToBlockId: clientIdToBlockIdRecord,
    };
  },
});

type TextStylePreset = "default" | "h1" | "h2" | "h3";

/**
 * After a document text preset is updated from the toolbar “sync” actions,
 * strip per-block fontSize/fontWeight so blocks inherit the new sheet values.
 */
async function clearTextBlockTypographyOverridesForDocumentAndStyle(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  style: TextStylePreset
): Promise<number> {
  let cleared = 0;
  const rows = await ctx.db
    .query("blocks")
    .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
    .collect();
  for (const row of rows) {
    const d = row.data;
    if (d.type !== "text" || d.style !== style) continue;
    if (d.fontSize === undefined && d.fontWeight === undefined) continue;
    await ctx.db.patch(row._id, {
      data: {
        type: "text",
        text: d.text,
        align: d.align,
        style: d.style,
        ...(d.ref !== undefined ? { ref: d.ref } : {}),
      },
    });
    cleared += 1;
  }
  return cleared;
}

const textStylePatchValidator = v.object({
  style: textStyle,
  fontSize: v.optional(v.float64()),
  fontWeight: v.optional(v.union(v.literal("normal"), v.literal("bold"))),
});

export const updateDocumentTextStyles = mutation({
  args: {
    documentId: v.id("documents"),
    patches: v.array(textStylePatchValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    if (args.patches.length === 0) {
      return { updated: 0, blocksTypographyCleared: 0 };
    }

    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error("Document not found.");
    }

    let updated = 0;
    let blocksTypographyCleared = 0;
    for (const p of args.patches) {
      if (p.fontSize === undefined && p.fontWeight === undefined) {
        continue;
      }
      const row = await ctx.db
        .query("documentTextStyles")
        .withIndex("by_documentId_style", (q) =>
          q.eq("documentId", args.documentId).eq("style", p.style)
        )
        .first();
      if (!row) {
        throw new Error(
          `Missing documentTextStyles row for style '${p.style}'.`
        );
      }
      const patch: { fontSize?: number; fontWeight?: "normal" | "bold" } = {};
      if (p.fontSize !== undefined) patch.fontSize = p.fontSize;
      if (p.fontWeight !== undefined) patch.fontWeight = p.fontWeight;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(row._id, patch);
        updated += 1;
        blocksTypographyCleared +=
          await clearTextBlockTypographyOverridesForDocumentAndStyle(
            ctx,
            args.documentId,
            p.style
          );
      }
    }

    return { updated, blocksTypographyCleared };
  },
});

export const syncProjectTextStylePresetAllDocuments = mutation({
  args: {
    projectId: v.id("projects"),
    style: textStyle,
    fontSize: v.float64(),
    fontWeight: v.union(v.literal("normal"), v.literal("bold")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    let rowsUpdated = 0;
    let blocksTypographyCleared = 0;
    for (const doc of documents) {
      const row = await ctx.db
        .query("documentTextStyles")
        .withIndex("by_documentId_style", (q) =>
          q.eq("documentId", doc._id).eq("style", args.style)
        )
        .first();
      if (!row) continue;
      await ctx.db.patch(row._id, {
        fontSize: args.fontSize,
        fontWeight: args.fontWeight,
      });
      rowsUpdated += 1;
      blocksTypographyCleared +=
        await clearTextBlockTypographyOverridesForDocumentAndStyle(
          ctx,
          doc._id,
          args.style
        );
    }

    return {
      documentCount: documents.length,
      rowsUpdated,
      blocksTypographyCleared,
    };
  },
});

export const createProjectFromPdf = mutation({
  args: {
    input: v.any(),
  },
  handler: async (ctx, args) => {
    const input = CreateProjectFromPdfInputSchema.parse(args.input);
    await requireIdentity(ctx);

    // `pdfToBlocks` is pure JS (no filesystem); it returns blocks with string ids.
    const importedBlocks = await pdfToBlocks(input);

    const projectName = getProjectNameFromImportedBlocks({
      blocks: importedBlocks,
    });

    const projectId = await ctx.db.insert("projects", {
      name: projectName,
      userId: "USER",
    });

    const documentId = await ctx.db.insert("documents", {
      name: "Master Resume",
      projectId,
      layout: [],
    });
    await ctx.db.insert("projectMasterDocuments", {
      projectId,
      documentId,
    });

    // Stylesheet defaults.
    await ctx.db.insert("documentPageStyles", {
      documentId,
      gap: DEFAULT_STYLE_SHEET.page.gap,
      marginTop: DEFAULT_STYLE_SHEET.page.margins.top,
      marginBottom: DEFAULT_STYLE_SHEET.page.margins.bottom,
      marginLeft: DEFAULT_STYLE_SHEET.page.margins.left,
      marginRight: DEFAULT_STYLE_SHEET.page.margins.right,
    });
    await ctx.db.insert("documentListStyles", {
      documentId,
      leftSpace: DEFAULT_STYLE_SHEET.list.leftSpace,
      rightSpace: DEFAULT_STYLE_SHEET.list.rightSpace,
    });

    const textStyleEntries = [
      { style: "default" as const, ...DEFAULT_STYLE_SHEET.text.default },
      { style: "h1" as const, ...DEFAULT_STYLE_SHEET.text.h1 },
      { style: "h2" as const, ...DEFAULT_STYLE_SHEET.text.h2 },
      { style: "h3" as const, ...DEFAULT_STYLE_SHEET.text.h3 },
    ];
    for (const entry of textStyleEntries) {
      await ctx.db.insert("documentTextStyles", {
        documentId,
        style: entry.style,
        fontSize: entry.fontSize,
        fontWeight: entry.fontWeight,
        fontFamily: entry.fontFamily,
        lineHeight: entry.lineHeight,
      });
    }

    // Insert all blocks, mapping imported string ids -> Convex block ids.
    const importedById = new Map<string, (typeof importedBlocks)[number]>();
    for (const b of importedBlocks as Array<{ id: string }>) {
      importedById.set(b.id, b as never);
    }

    const newIdByImportedId = new Map<string, Id<"blocks">>();
    for (const b of importedBlocks as Array<{ id: string; type: string }>) {
      const placeholder = (() => {
        if (b.type === "text") {
          const tb = b as unknown as {
            text: string;
            align: "left" | "center" | "right";
            style: "default" | "h1" | "h2" | "h3";
            ref?: string;
            fontSize?: number;
            fontWeight?: "normal" | "bold";
          };
          return {
            type: "text" as const,
            text: tb.text,
            align: tb.align,
            style: tb.style,
            ...(tb.fontSize !== undefined ? { fontSize: tb.fontSize } : {}),
            ...(tb.fontWeight !== undefined
              ? { fontWeight: tb.fontWeight }
              : {}),
          };
        }
        if (b.type === "section") {
          return { type: "section" as const, children: [] as Id<"blocks">[] };
        }
        if (b.type === "columns") {
          return {
            type: "columns" as const,
            children: [] as Array<{ span: number; blockId: Id<"blocks"> }>,
          };
        }
        const lb = b as unknown as {
          bullet: {
            type: "normal" | "alphabetical" | "numerical";
            value?: string;
          };
          leftSpace?: number;
          rightSpace?: number;
        };
        return {
          type: "list" as const,
          children: [] as Id<"blocks">[],
          bulletType: lb.bullet?.type ?? "normal",
          bulletValue:
            lb.bullet?.type === "normal" ? (lb.bullet.value ?? "-") : undefined,
          leftSpace: lb.leftSpace,
          rightSpace: lb.rightSpace,
        };
      })();

      const newId = await ctx.db.insert("blocks", {
        documentId,
        data: placeholder,
      });
      newIdByImportedId.set(b.id, newId);
    }

    // Patch blocks with real refs/children now that all ids exist.
    for (const b of importedBlocks as Array<{
      id: string;
      type: string;
      ref?: string;
      blocks?: unknown;
    }>) {
      const newId = newIdByImportedId.get(b.id);
      if (!newId) continue;

      if (b.type === "text") {
        const tb = b as unknown as {
          text: string;
          align: "left" | "center" | "right";
          style: "default" | "h1" | "h2" | "h3";
          ref?: string;
          fontSize?: number;
          fontWeight?: "normal" | "bold";
        };
        await ctx.db.patch(newId, {
          data: {
            type: "text",
            text: tb.text,
            align: tb.align,
            style: tb.style,
            ref: tb.ref ? newIdByImportedId.get(tb.ref) : undefined,
            ...(tb.fontSize !== undefined ? { fontSize: tb.fontSize } : {}),
            ...(tb.fontWeight !== undefined
              ? { fontWeight: tb.fontWeight }
              : {}),
          },
        });
        continue;
      }

      if (b.type === "section") {
        const sb = b as unknown as { blocks: string[]; ref?: string };
        await ctx.db.patch(newId, {
          data: {
            type: "section",
            children: (sb.blocks ?? [])
              .map((cid) => newIdByImportedId.get(cid))
              .filter((id): id is Id<"blocks"> => id != null),
            ref: sb.ref ? newIdByImportedId.get(sb.ref) : undefined,
          },
        });
        continue;
      }

      if (b.type === "columns") {
        const cb = b as unknown as {
          blocks: Array<{ blockId: string; span: number }>;
          ref?: string;
        };
        await ctx.db.patch(newId, {
          data: {
            type: "columns",
            children: (cb.blocks ?? [])
              .map((c) => {
                const mapped = newIdByImportedId.get(c.blockId);
                if (!mapped) return null;
                return { blockId: mapped, span: c.span };
              })
              .filter(
                (c): c is { blockId: Id<"blocks">; span: number } => c != null
              ),
            ref: cb.ref ? newIdByImportedId.get(cb.ref) : undefined,
          },
        });
        continue;
      }

      const lb = b as unknown as {
        blocks: string[];
        bullet: {
          type: "normal" | "alphabetical" | "numerical";
          value?: string;
        };
        leftSpace?: number;
        rightSpace?: number;
        ref?: string;
      };

      await ctx.db.patch(newId, {
        data: {
          type: "list",
          children: (lb.blocks ?? [])
            .map((cid) => newIdByImportedId.get(cid))
            .filter((id): id is Id<"blocks"> => id != null),
          bulletType: lb.bullet?.type ?? "normal",
          bulletValue:
            lb.bullet?.type === "normal" ? (lb.bullet.value ?? "-") : undefined,
          leftSpace: lb.leftSpace,
          rightSpace: lb.rightSpace,
          ref: lb.ref ? newIdByImportedId.get(lb.ref) : undefined,
        },
      });
    }

    const mainLayoutImported = getMainLayoutImportedBlockIds(
      importedBlocks as Array<{ id: string; type: string; blocks?: unknown }>
    );
    const layout = mainLayoutImported
      .map((oldId) => newIdByImportedId.get(oldId))
      .filter((id): id is Id<"blocks"> => id != null);

    await ctx.db.patch(documentId, { layout });

    return {
      projectId,
      documentId,
      blockCount: importedBlocks.length,
    };
  },
});
