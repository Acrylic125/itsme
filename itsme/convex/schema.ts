import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const textStyle = v.union(
  v.literal("default"),
  v.literal("h1"),
  v.literal("h2"),
  v.literal("h3")
);

const fontWeight = v.union(v.literal("normal"), v.literal("bold"));

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

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    userId: v.string(),
  }).index("by_userId", ["userId"]),

  documents: defineTable({
    name: v.string(),
    projectId: v.id("projects"),
    layout: v.array(v.id("blocks")),
  }).index("by_projectId", ["projectId"]),

  projectMasterDocuments: defineTable({
    projectId: v.id("projects"),
    documentId: v.id("documents"),
  }).index("by_projectId", ["projectId"]),

  blocks: defineTable({
    documentId: v.id("documents"),
    data: v.union(
      v.object({
        type: v.literal("text"),
        text: v.string(),
        align: textAlign,
        style: textStyle,
        fontSize: v.optional(v.float64()),
        fontWeight: v.optional(fontWeight),
        lineHeight: v.optional(v.float64()),
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
      }),
      v.object({
        type: v.literal("spacer"),
        height: v.float64(),
        ref: v.optional(v.id("blocks")),
      })
    ),
  }).index("by_documentId", ["documentId"]),

  documentPageStyles: defineTable({
    documentId: v.id("documents"),
    gap: v.float64(),
    marginTop: v.float64(),
    marginBottom: v.float64(),
    marginLeft: v.float64(),
    marginRight: v.float64(),
  }).index("by_documentId", ["documentId"]),

  documentTextStyles: defineTable({
    documentId: v.id("documents"),
    style: textStyle,
    fontSize: v.float64(),
    fontWeight,
    fontFamily: v.string(),
    lineHeight: v.float64(),
  })
    .index("by_documentId", ["documentId"])
    .index("by_documentId_style", ["documentId", "style"]),

  documentListStyles: defineTable({
    documentId: v.id("documents"),
    leftSpace: v.float64(),
    rightSpace: v.float64(),
  }).index("by_documentId", ["documentId"]),
});
