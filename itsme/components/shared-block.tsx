"use client";

import { useCallback, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import Konva from "konva";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

const HOVER_FILL = "#f3f4f6";

export function HoverRegion({
  x,
  y,
  width,
  height,
  dpi = 300,
  children,
  onContextMenu,
  onClick,
  inFocus = false,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  dpi?: number;
  inFocus?: boolean;
} & {
  children: React.ReactNode;
  onContextMenu?: (args: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: { left: number; top: number; width: number; height: number };
  }) => void;
  onClick?: (args: {
    event: Konva.KonvaEventObject<MouseEvent>;
    anchor: { left: number; top: number; width: number; height: number };
  }) => void;
}) {
  const groupRef = useRef<Konva.Group | null>(null);
  const [hovered, setHovered] = useState(false);

  const handleContextMenu = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.evt.preventDefault();
      if (!onContextMenu) return;
      const node = groupRef.current;
      const stage = node?.getStage();
      const container = stage?.container();
      if (!node || !stage || !container) return;

      const stageRect = container.getBoundingClientRect();
      const r = node.getClientRect();
      onContextMenu({
        event,
        anchor: {
          left: r.x / stageRect.width,
          top: (r.y + r.height) / stageRect.height,
          width: r.width / stageRect.width,
          height: r.height / stageRect.height,
        },
      });
    },
    [onContextMenu]
  );

  const handleClick = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.evt.button !== 0) return;
      event.evt.preventDefault();
      if (!onClick) return;
      const node = groupRef.current;
      const stage = node?.getStage();
      const container = stage?.container();
      if (!node || !stage || !container) return;

      const stageRect = container.getBoundingClientRect();
      const r = node.getClientRect();
      onClick({
        event,
        anchor: {
          left: r.x / stageRect.width,
          top: (r.y + r.height) / stageRect.height,
          width: r.width / stageRect.width,
          height: r.height / stageRect.height,
        },
      });
    },
    [onClick]
  );

  const innerStroke = 0.01 * dpi;
  const outerStroke = 0.01 * dpi;
  /** Space between the outer edge of the inner stroke and the inner edge of the outer stroke. */
  const ringGap = 0.005 * dpi;
  const padding = innerStroke / 2 + ringGap + outerStroke / 2;
  const innerRadius = 0.01 * dpi;
  const outerRadius = innerRadius + padding;

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
      onContextMenu={handleContextMenu}
      onClick={handleClick}
    >
      {(hovered || inFocus) && (
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fillEnabled={false}
          stroke="#ffb86a"
          strokeWidth={innerStroke}
          cornerRadius={innerRadius}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      {hovered && (
        <Rect
          x={-padding}
          y={-padding}
          width={width + 2 * padding}
          height={height + 2 * padding}
          fillEnabled={false}
          stroke="#ffb86a7f"
          strokeWidth={outerStroke}
          cornerRadius={outerRadius}
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
