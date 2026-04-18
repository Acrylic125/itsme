"use client";

import { useRef, useState } from "react";
import { Group, Rect, Text } from "react-konva";
import Konva from "konva";
import type {
  Document,
  LayoutBlockComponentProps,
  TextStyle,
} from "./document-blocks";
import {
  estimateLineCount,
  getProportionalColumnWidths,
} from "./document-blocks";
import { useDocumentRender } from "./document-render-context";
import { useDomPopup } from "./dom-popup";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

const HOVER_FILL = "#f3f4f6";

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

export function HoverRegion({
  x,
  y,
  width,
  height,
  children,
  onClick,
}: LayoutBlockComponentProps & {
  children: React.ReactNode;
  onClick?: (args: {
    anchor: { left: number; top: number; width: number; height: number };
  }) => void;
}) {
  const groupRef = useRef<Konva.Group | null>(null);
  const [hovered, setHovered] = useState(false);

  return (
    <Group
      ref={(n) => {
        groupRef.current = n;
      }}
      x={x}
      y={y}
      width={width}
      height={height}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!onClick) return;
        const node = groupRef.current;
        const stage = node?.getStage();
        const container = stage?.container();
        if (!node || !stage || !container) return;

        const stageRect = container.getBoundingClientRect();
        const r = node.getClientRect();
        onClick({
          anchor: {
            left: r.x / stageRect.width,
            top: (r.y + r.height) / stageRect.height,
            // width: width / stageRect.width,
            // height: height / stageRect.height,
            width: r.width / stageRect.width,
            height: r.height / stageRect.height,
          },
        });
      }}
    >
      {hovered && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={HOVER_FILL}
          cornerRadius={2}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      {children}
    </Group>
  );
}

export function SingleTextInputModal({
  defaultValue,
  closePopup,
}: {
  defaultValue: string;
  closePopup: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4 rounded-xl shadow-xl">
      <Textarea className="w-full" defaultValue={defaultValue} />
      <div className="flex gap-2">
        <Button className="w-fit">Save</Button>
        <Button className="w-fit" variant="outline" onClick={closePopup}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function TwoColumnHeaderNode({
  x,
  y,
  width,
  height,
  header,
}: LayoutBlockComponentProps & { header: HeaderLayout }) {
  const document = useDocumentRender();
  const { openPopup } = useDomPopup();
  return (
    <Group x={x} y={y} width={width} height={height}>
      <HoverRegion
        x={0}
        y={0}
        width={header.allocLeft}
        height={header.height}
        onClick={({ anchor }) => {
          openPopup({
            anchor,
            content: ({ closePopup }) => (
              <SingleTextInputModal
                defaultValue={header.leftText}
                key={header.leftText}
                closePopup={closePopup}
              />
              // <div className="w-full h-48 bg-yellow-500">Hello world</div>
            ),
          });
        }}
      >
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
      </HoverRegion>
      {header.rightText && (
        <HoverRegion
          x={header.allocLeft}
          y={0}
          width={header.allocRight}
          height={header.height}
          onClick={({ anchor }) => {
            openPopup({
              anchor,
              content: ({ closePopup }) => (
                <SingleTextInputModal
                  defaultValue={header.rightText}
                  key={header.rightText}
                  closePopup={closePopup}
                />
                // <div className="w-full h-48 bg-yellow-500">Hello world</div>
              ),
            });
          }}
        >
          <Text
            // x={header.allocLeft}
            // y={0}
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
        </HoverRegion>
      )}
    </Group>
  );
}
