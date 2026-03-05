"use client";

import type {
  BlockWithSection,
  Document,
  LayoutBlockComponentProps,
} from "./document-blocks";
import { getHeadingStyle } from "./document-blocks";
import { computeHeaderLayout, HoverRegion, TwoColumnHeaderNode } from "./blocks-shared";

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
      <HoverRegion {...props}>
        <TwoColumnHeaderNode
          x={0}
          y={0}
          width={props.width}
          height={props.height}
          header={header}
        />
      </HoverRegion>
    ),
  };
}

