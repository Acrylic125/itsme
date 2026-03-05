"use client";

import { Group, Text } from "react-konva";
import type {
  BlockWithSection,
  Document,
  LayoutBlockComponentProps,
  TextStyle,
} from "./document-blocks";
import {
  estimateLineCount,
  getHeadingStyle,
  getProportionalColumnWidths,
} from "./document-blocks";
import { useDocumentRender } from "./document-render-context";
import { computeHeaderLayout, type HeaderLayout, TwoColumnHeaderNode } from "./blocks-shared";

function TwoColumnListBlockNode({
  x,
  y,
  width,
  height,
  header,
  rows,
  bodyStyle,
}: LayoutBlockComponentProps & {
  header: HeaderLayout | null;
  rows: Array<{
    leftText: string;
    rightText: string;
    allocLeft: number;
    allocRight: number;
    height: number;
    y: number;
  }>;
  bodyStyle: TextStyle;
}) {
  const document = useDocumentRender();
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
            x={0}
            y={0}
            width={row.allocLeft}
            text={row.leftText}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
          <Text
            x={row.allocLeft}
            y={0}
            width={row.allocRight}
            text={row.rightText}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="right"
            fill="#000000"
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </Group>
  );
}

export function renderTwoColumnList({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "2-column-list" }>;
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

  const rows = block.points
    .map(([leftText, rightText]) => {
      const { left: allocLeft, right: allocRight } =
        getProportionalColumnWidths({
          leftText,
          rightText,
          fontFamily: document.font,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          totalWidth: parent.width,
        });

      if (allocLeft <= 0 && allocRight <= 0) {
        return null;
      }

      const leftLines = estimateLineCount(
        leftText,
        document.font,
        bodyStyle.fontSize,
        bodyStyle.fontWeight,
        allocLeft
      );
      const rightLines = estimateLineCount(
        rightText,
        document.font,
        bodyStyle.fontSize,
        bodyStyle.fontWeight,
        allocRight
      );

      const lines = Math.max(leftLines, rightLines || 1);
      const height = Math.max(1, lines) * bodyLineHeight;

      return { leftText, rightText, allocLeft, allocRight, height };
    })
    .filter(Boolean) as Array<{
    leftText: string;
    rightText: string;
    allocLeft: number;
    allocRight: number;
    height: number;
  }>;

  const rowY: number[] = [];
  let y = header?.height ?? 0;
  for (const row of rows) {
    rowY.push(y);
    y += row.height;
  }

  return {
    estimatedDimensions: { width: parent.width, height: y },
    component: (props: LayoutBlockComponentProps) => (
      <TwoColumnListBlockNode
        {...props}
        header={header}
        rows={rows.map((r, idx) => ({ ...r, y: rowY[idx] }))}
        bodyStyle={bodyStyle}
      />
    ),
  };
}

