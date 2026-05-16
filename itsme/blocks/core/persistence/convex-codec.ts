import type { Block } from "../../blocks";

/** Row `data` shape for Convex `blocks` table (`blockDataValidator`). */
export type ConvexBlockRowData =
  | {
      type: "text";
      text: string;
      align: "left" | "center" | "right";
      style: "default" | "h1" | "h2" | "h3";
      fontSize?: number;
      fontWeight?: "normal" | "bold";
      lineHeight?: number;
      ref?: string;
    }
  | {
      type: "section";
      children: string[];
      ref?: string;
    }
  | {
      type: "columns";
      children: { span: number; blockId: string }[];
      ref?: string;
    }
  | {
      type: "list";
      children: string[];
      bulletType: "normal" | "alphabetical" | "numerical";
      bulletValue?: string;
      leftSpace?: number;
      rightSpace?: number;
      ref?: string;
    }
  | {
      type: "spacer";
      height: number;
      ref?: string;
    };

export function clientBlockToConvexData(block: Block): ConvexBlockRowData {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: block.text,
        align: block.align,
        style: block.style,
        ...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}),
        ...(block.fontWeight !== undefined
          ? { fontWeight: block.fontWeight }
          : {}),
        ...(block.lineHeight !== undefined
          ? { lineHeight: block.lineHeight }
          : {}),
        ref: block.ref ? block.ref : undefined,
      };
    case "section":
      return {
        type: "section",
        children: block.blocks,
        ref: block.ref ? block.ref : undefined,
      };
    case "columns":
      return {
        type: "columns",
        children: block.blocks.map((c) => ({
          span: c.span,
          blockId: c.blockId,
        })),
        ref: block.ref ? block.ref : undefined,
      };
    case "list": {
      const bullet = block.bullet;
      if (bullet.type === "normal") {
        return {
          type: "list",
          children: block.blocks,
          bulletType: "normal" as const,
          bulletValue: bullet.value,
          leftSpace: block.leftSpace,
          rightSpace: block.rightSpace,
          ref: block.ref ? block.ref : undefined,
        };
      }
      return {
        type: "list",
        children: block.blocks,
        bulletType: bullet.type,
        leftSpace: block.leftSpace,
        rightSpace: block.rightSpace,
        ref: block.ref ? block.ref : undefined,
      };
    }
    case "spacer":
      return {
        type: "spacer",
        height: block.height,
        ref: block.ref ? block.ref : undefined,
      };
    default: {
      const _x: never = block;
      return _x;
    }
  }
}

export function convexDataToClientBlock(args: {
  id: string;
  data: ConvexBlockRowData;
}): Block {
  const { id, data } = args;

  if (data.type === "text") {
    return {
      id,
      type: "text",
      text: data.text,
      align: data.align,
      style: data.style,
      ref: data.ref ?? undefined,
      ...(data.fontSize !== undefined ? { fontSize: data.fontSize } : {}),
      ...(data.fontWeight !== undefined ? { fontWeight: data.fontWeight } : {}),
      ...(data.lineHeight !== undefined ? { lineHeight: data.lineHeight } : {}),
    };
  }

  if (data.type === "section") {
    return {
      id,
      type: "section",
      blocks: [...data.children],
      ref: data.ref ?? undefined,
    };
  }

  if (data.type === "columns") {
    return {
      id,
      type: "columns",
      blocks: data.children.map((c) => ({
        span: c.span,
        blockId: c.blockId,
      })),
      ref: data.ref ?? undefined,
    };
  }

  if (data.type === "spacer") {
    return {
      id,
      type: "spacer",
      height: data.height,
      ref: data.ref ?? undefined,
    };
  }

  const bullet =
    data.bulletType === "normal"
      ? {
          type: "normal" as const,
          value: data.bulletValue ?? "-",
        }
      : ({
          type: data.bulletType,
        } as const);

  return {
    id,
    type: "list",
    blocks: [...data.children],
    bullet,
    leftSpace: data.leftSpace ?? undefined,
    rightSpace: data.rightSpace ?? undefined,
    ref: data.ref ?? undefined,
  };
}

export function remapConvexBlockRowData(
  data: ConvexBlockRowData,
  mapId: (id: string) => string
): ConvexBlockRowData {
  switch (data.type) {
    case "text":
      return {
        ...data,
        ref: data.ref,
      };
    case "section":
      return {
        ...data,
        children: data.children.map(mapId),
        ref: data.ref,
      };
    case "columns":
      return {
        ...data,
        children: data.children.map((c) => ({
          ...c,
          blockId: mapId(c.blockId),
        })),
        ref: data.ref,
      };
    case "list":
      return {
        ...data,
        children: data.children.map(mapId),
        ref: data.ref,
      };
    case "spacer":
      return {
        ...data,
        ref: data.ref,
      };
  }
}
