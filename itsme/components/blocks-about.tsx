"use client";

import { Group, Text } from "react-konva";
import type {
  BlockWithSection,
  Document,
  LayoutBlockComponentProps,
  TextStyle,
} from "./document-blocks";
import { estimateLineCount, getHeadingStyle } from "./document-blocks";
import { useDocumentRender } from "./document-render-context";

function AboutBlockNode({
  x,
  y,
  width,
  height,
  headerText,
  subtitleText,
  headerStyle,
  subtitleStyle,
  headerHeight,
}: LayoutBlockComponentProps & {
  headerText: string;
  subtitleText: string;
  headerStyle: TextStyle;
  subtitleStyle: TextStyle;
  headerHeight: number;
}) {
  const document = useDocumentRender();
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Text
        x={0}
        y={0}
        width={width}
        text={headerText}
        fontFamily={document.font}
        fontSize={headerStyle.fontSize}
        lineHeight={headerStyle.lineHeight}
        fontStyle={headerStyle.fontWeight === "bold" ? "bold" : "normal"}
        align="center"
        fill="#000000"
        perfectDrawEnabled={false}
      />
      <Text
        x={0}
        y={headerHeight}
        width={width}
        text={subtitleText}
        fontFamily={document.font}
        fontSize={subtitleStyle.fontSize}
        lineHeight={subtitleStyle.lineHeight}
        fontStyle={subtitleStyle.fontWeight === "bold" ? "bold" : "normal"}
        align="center"
        fill="#000000"
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

export function renderAbout({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "about" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const headerStyle = getHeadingStyle(1, headingOffset, document.textStyles);
  const subtitleStyle = document.textStyles.default;
  const subtitleLine = block.points.join(" | ");

  const headerLines = estimateLineCount(
    block.header,
    document.font,
    headerStyle.fontSize,
    headerStyle.fontWeight,
    parent.width
  );
  const headerHeight =
    headerLines * headerStyle.fontSize * headerStyle.lineHeight;

  const subtitleLines = estimateLineCount(
    subtitleLine,
    document.font,
    subtitleStyle.fontSize,
    subtitleStyle.fontWeight,
    parent.width
  );
  const subtitleHeight =
    subtitleLines * subtitleStyle.fontSize * subtitleStyle.lineHeight;

  const estimatedHeight = headerHeight + subtitleHeight;

  return {
    estimatedDimensions: { width: parent.width, height: estimatedHeight },
    component: (props: LayoutBlockComponentProps) => (
      <AboutBlockNode
        {...props}
        headerText={block.header}
        subtitleText={subtitleLine}
        headerStyle={headerStyle}
        subtitleStyle={subtitleStyle}
        headerHeight={headerHeight}
      />
    ),
  };
}

