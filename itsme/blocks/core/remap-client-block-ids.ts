import type { Block } from "../blocks";

/** Remap block row ids (and child refs) using `mapId`. */
export function remapClientBlockIds(
  blocks: Block[],
  mapId: (oldId: string) => string,
  options?: { preserveRefs?: boolean }
): Block[] {
  const preserveRefs = options?.preserveRefs ?? false;
  const refFields = (ref: string | undefined) =>
    preserveRefs && ref !== undefined ? { ref } : {};

  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return {
          type: "text",
          id: mapId(b.id),
          text: b.text,
          align: b.align,
          style: b.style,
          ...(b.fontSize !== undefined ? { fontSize: b.fontSize } : {}),
          ...(b.fontWeight !== undefined ? { fontWeight: b.fontWeight } : {}),
          ...refFields(b.ref),
        };
      case "section":
        return {
          type: "section",
          id: mapId(b.id),
          blocks: b.blocks.map(mapId),
          ...refFields(b.ref),
        };
      case "list":
        return {
          type: "list",
          id: mapId(b.id),
          blocks: b.blocks.map(mapId),
          bullet: b.bullet,
          ...(b.leftSpace !== undefined ? { leftSpace: b.leftSpace } : {}),
          ...(b.rightSpace !== undefined ? { rightSpace: b.rightSpace } : {}),
          ...refFields(b.ref),
        };
      case "columns":
        return {
          type: "columns",
          id: mapId(b.id),
          blocks: b.blocks.map((c) => ({
            ...c,
            blockId: mapId(c.blockId),
          })),
          ...refFields(b.ref),
        };
    }
  });
}
