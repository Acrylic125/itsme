"use client";

import { Group, Text } from "react-konva";
import type { Document, LayoutBlockComponentProps, TextStyle } from "./document-blocks";
import {
  estimateLineCount,
  getProportionalColumnWidths,
} from "./document-blocks";
import { useDocumentRender } from "./document-render-context";

export type HeaderLayout = {
  leftText: string;
  rightText: string;
  allocLeft: number;
  allocRight: number;
  height: number;
  style: TextStyle;
};

export function computeHeaderLayout(args: {
  document: Document;
  leftText: string;
  rightText: string;
  style: TextStyle;
  totalWidth: number;
}): HeaderLayout {
  const { document, leftText, rightText, style, totalWidth } = args;
  const { left: allocLeft, right: allocRight } = getProportionalColumnWidths({
    leftText,
    rightText,
    fontFamily: document.font,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    totalWidth,
  });

  const leftLines = estimateLineCount(
    leftText,
    document.font,
    style.fontSize,
    style.fontWeight,
    allocLeft
  );
  const rightLines = estimateLineCount(
    rightText,
    document.font,
    style.fontSize,
    style.fontWeight,
    allocRight
  );
  const lines = Math.max(leftLines, rightLines || 1);
  const height = lines * style.fontSize * style.lineHeight;

  return { leftText, rightText, allocLeft, allocRight, height, style };
}

export function TwoColumnHeaderNode({
  x,
  y,
  width,
  height,
  header,
}: LayoutBlockComponentProps & { header: HeaderLayout }) {
  const document = useDocumentRender();
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Text
        x={0}
        y={0}
        width={header.allocLeft}
        text={header.leftText}
        fontFamily={document.font}
        fontSize={header.style.fontSize}
        lineHeight={header.style.lineHeight}
        fontStyle={header.style.fontWeight === "bold" ? "bold" : "normal"}
        align="left"
        fill="#000000"
        perfectDrawEnabled={false}
      />
      {header.rightText && (
        <Text
          x={header.allocLeft}
          y={0}
          width={header.allocRight}
          text={header.rightText}
          fontFamily={document.font}
          fontSize={header.style.fontSize}
          lineHeight={header.style.lineHeight}
          fontStyle={header.style.fontWeight === "bold" ? "bold" : "normal"}
          align="right"
          fill="#000000"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}

