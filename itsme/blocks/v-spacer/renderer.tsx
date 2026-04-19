"use client";

import { LayoutBlockComponentProps } from "../renderer-utils";
import type { BlockWithSection, Document } from "../schema";

export function renderSpacer({
  block,
  parent,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "v-spacer" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  return {
    estimatedDimensions: { width: parent.width, height: block.height },
    component: (_props: LayoutBlockComponentProps) => null,
  };
}
