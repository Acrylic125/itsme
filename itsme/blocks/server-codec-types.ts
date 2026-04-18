import type { Block, BlockWithSection } from "@/components/document-blocks";

export type CreatePrefixedId = (prefix: "p_") => string;

export type InsertBlockHelpers = {
  insertPointChain: (values: string[]) => Promise<string[]>;
  createPrefixedId: CreatePrefixedId;
  insertBlock: (block: Block) => Promise<string>;
};

export type DecodeBlockMaps = {
  aboutByBlockId: Map<string, { blockId: string; header: string }>;
  bulletByBlockId: Map<
    string,
    {
      blockId: string;
      headerLeftContent: string | null;
      headerRightContent: string | null;
    }
  >;
  twoColumnByBlockId: Map<
    string,
    {
      blockId: string;
      headerLeftContent: string | null;
      headerRightContent: string | null;
    }
  >;
  spacerByBlockId: Map<string, { blockId: string; height: number }>;
  sectionByBlockId: Map<
    string,
    {
      blockId: string;
      headerLeftContent: string;
      headerRightContent: string;
    }
  >;
  aboutPointsByBlockId: Map<string, string[]>;
  bulletPointsByBlockId: Map<string, string[]>;
  twoColumnPointsByBlockId: Map<string, [string, string][]>;
  sectionChildrenBySectionId: Map<string, string[]>;
};

export type DecodeBlockHelpers = {
  buildBlock: (blockId: string) => BlockWithSection | null;
};
