"use client";

import type { BlockWithSection, Document } from "../schema";
import { LayoutBlockComponentProps, getHeadingStyle } from "../renderer-utils";
import {
  computeHeaderLayout,
  TwoColumnHeaderNode,
} from "@/components/blocks-shared";

export function renderSection({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "section" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const style = getHeadingStyle(2, headingOffset, document.textStyles);
  const header = computeHeaderLayout({
    document,
    leftText: block.header[0],
    rightText: block.header[1],
    style,
    totalWidth: parent.width,
  });

  return {
    estimatedDimensions: { width: parent.width, height: header.height },
    component: (props: LayoutBlockComponentProps) => (
      <TwoColumnHeaderNode
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        header={header}
      />
    ),
  };
}
