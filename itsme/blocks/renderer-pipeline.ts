"use client";

import { renderAbout } from "@/blocks/about/renderer";
import { renderSection } from "@/blocks/section/renderer";
import { renderBulletList } from "@/blocks/bullet-list/renderer";
import { renderTwoColumnList } from "@/blocks/two-column-list/renderer";
import { renderSpacer } from "@/blocks/v-spacer/renderer";
import { LayoutBlockRenderers } from "./renderer-utils";

export const BLOCK_RENDERERS: LayoutBlockRenderers = {
  about: renderAbout,
  section: renderSection,
  "bullet-list": renderBulletList,
  "2-column-list": renderTwoColumnList,
  "v-spacer": renderSpacer,
};
