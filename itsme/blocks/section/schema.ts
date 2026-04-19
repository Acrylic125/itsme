import { z } from "zod";
import { AboutBlockSchema } from "../about/schema";
import { BulletListBlockSchema } from "../bullet-list/schema";
import { TwoColumnListBlockSchema } from "../two-column-list/schema";
import { SpacerBlockSchema } from "../v-spacer/schema";

export const BaseBlockSchema = z.union([
  AboutBlockSchema,
  BulletListBlockSchema,
  TwoColumnListBlockSchema,
  SpacerBlockSchema,
]);

export type BaseBlock = z.infer<typeof BaseBlockSchema>;

export const SectionBlockSchema = z.object({
  type: z.literal("section"),
  header: z.tuple([z.string(), z.string()]),
  blocks: z.array(BaseBlockSchema),
});
