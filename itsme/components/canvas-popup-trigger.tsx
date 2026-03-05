"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import type { LayoutBlockComponentProps } from "./document-blocks";
import { HoverRegion } from "./blocks-shared";
import { useDomPopup } from "./dom-popup";

let _triggerSeq = 0;

function useStableId(provided?: string) {
  const ref = useRef<string | null>(null);
  if (ref.current == null) {
    ref.current = provided ?? `canvas-trigger-${++_triggerSeq}`;
  }
  return ref.current;
}

type CanvasPopupTriggerProps = LayoutBlockComponentProps & {
  children: ReactNode;
  popupContent: ReactNode;
  popupId?: string;
};

export function CanvasPopupTrigger({
  x,
  y,
  width,
  height,
  children,
  popupContent,
  popupId,
}: CanvasPopupTriggerProps) {
  const { openPopup, closePopup, isOpen, currentId } = useDomPopup();
  const id = useStableId(popupId);

  return (
    <HoverRegion
      x={x}
      y={y}
      width={width}
      height={height}
      onClick={({ anchor }) => {
        if (isOpen && currentId === id) {
          closePopup();
          return;
        }
        openPopup({ id, anchor, content: popupContent });
      }}
    >
      {children}
    </HoverRegion>
  );
}
