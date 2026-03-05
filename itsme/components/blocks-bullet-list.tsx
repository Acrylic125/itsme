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
import { computeHeaderLayout, type HeaderLayout, TwoColumnHeaderNode } from "./blocks-shared";

function BulletListBlockNode({
  x,
  y,
  width,
  height,
  header,
  rows,
  bodyStyle,
}: LayoutBlockComponentProps & {
  header: HeaderLayout | null;
  rows: Array<{ text: string; height: number; y: number }>;
  bodyStyle: TextStyle;
}) {
  const document = useDocumentRender();
  const bulletX = document.bulletListStyle.indent;
  const textX = bulletX + document.bulletListStyle.gap;
  const textWidth = width - textX;

  return (
    <Group x={x} y={y} width={width} height={height}>
      {header && (
        <TwoColumnHeaderNode
          x={0}
          y={0}
          width={width}
          height={header.height}
          header={header}
        />
      )}
      {rows.map((row, idx) => (
        <Group key={idx} y={row.y}>
          <Text
            x={bulletX}
            y={0}
            width={document.bulletListStyle.gap}
            text={document.bulletListStyle.bullet}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
          <Text
            x={textX}
            y={0}
            width={textWidth}
            text={row.text}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </Group>
  );
}

export function renderBulletList({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "bullet-list" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const headerStyle = getHeadingStyle(2, headingOffset, document.textStyles);
  const bodyStyle = document.textStyles.default;
  const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

  const header = block.header
    ? computeHeaderLayout({
        document,
        leftText: block.header[0],
        rightText: block.header[1],
        style: headerStyle,
        totalWidth: parent.width,
      })
    : null;

  const bulletX = document.bulletListStyle.indent;
  const textX = bulletX + document.bulletListStyle.gap;
  const textWidth = parent.width - textX;

  const rows = block.points.map((point) => {
    const lines = estimateLineCount(
      point,
      document.font,
      bodyStyle.fontSize,
      bodyStyle.fontWeight,
      textWidth
    );
    const height = Math.max(1, lines) * bodyLineHeight;
    return { text: point, height };
  });

  const rowY: number[] = [];
  let y = header?.height ?? 0;
  for (const row of rows) {
    rowY.push(y);
    y += row.height;
  }

  return {
    estimatedDimensions: { width: parent.width, height: y },
    component: (props: LayoutBlockComponentProps) => (
      <BulletListBlockNode
        {...props}
        header={header}
        rows={rows.map((r, idx) => ({ ...r, y: rowY[idx] }))}
        bodyStyle={bodyStyle}
      />
    ),
  };
}

