"use client";

import type { LayoutBlockRenderers } from "./document-blocks";

import { renderAbout } from "./blocks-about";
import { renderSection } from "./blocks-section";
import { renderBulletList } from "./blocks-bullet-list";
import { renderTwoColumnList } from "./blocks-two-column-list";
import { renderSpacer } from "./blocks-v-spacer";

export const BLOCK_RENDERERS: LayoutBlockRenderers = {
  about: renderAbout,
  section: renderSection,
  "bullet-list": renderBulletList,
  "2-column-list": renderTwoColumnList,
  "v-spacer": renderSpacer,
};

