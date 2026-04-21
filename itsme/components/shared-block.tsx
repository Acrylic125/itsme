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
  children,
  onContextMenu,
  onClick,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
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
