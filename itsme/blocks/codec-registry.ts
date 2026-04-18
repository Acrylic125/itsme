import type { BlockWithSection } from "@/components/document-blocks";
import { insertAboutBlockDetails, decodeAboutBlock } from "@/blocks/about/codec";
import {
  insertBulletListBlockDetails,
  decodeBulletListBlock,
} from "@/blocks/bullet-list/codec";
import {
  insertTwoColumnListBlockDetails,
  decodeTwoColumnListBlock,
} from "@/blocks/two-column-list/codec";
import { insertSpacerBlockDetails, decodeSpacerBlock } from "@/blocks/v-spacer/codec";
import { insertSectionBlockDetails, decodeSectionBlock } from "@/blocks/section/codec";
import type {
  DecodeBlockHelpers,
  DecodeBlockMaps,
  InsertBlockHelpers,
} from "@/blocks/server-codec-types";

export const BLOCK_INSERT_CODECS: {
  [K in BlockWithSection["type"]]: (args: {
    blockId: string;
    block: Extract<BlockWithSection, { type: K }>;
    helpers: InsertBlockHelpers;
  }) => Promise<void>;
} = {
  about: insertAboutBlockDetails,
  "bullet-list": insertBulletListBlockDetails,
  "2-column-list": insertTwoColumnListBlockDetails,
  "v-spacer": insertSpacerBlockDetails,
  section: insertSectionBlockDetails,
};

export const BLOCK_DECODE_CODECS: {
  [K in BlockWithSection["type"]]: (args: {
    blockId: string;
    maps: DecodeBlockMaps;
    helpers: DecodeBlockHelpers;
  }) => Extract<BlockWithSection, { type: K }> | null;
} = {
  about: ({ blockId, maps }) => decodeAboutBlock({ blockId, maps }),
  "bullet-list": ({ blockId, maps }) => decodeBulletListBlock({ blockId, maps }),
  "2-column-list": ({ blockId, maps }) =>
    decodeTwoColumnListBlock({ blockId, maps }),
  "v-spacer": ({ blockId, maps }) => decodeSpacerBlock({ blockId, maps }),
  section: ({ blockId, maps, helpers }) =>
    decodeSectionBlock({ blockId, maps, helpers }),
};
