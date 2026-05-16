"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Block } from "@/blocks/blocks";
import { SyncToMasterButton } from "@/blocks/sync-to-master-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function clampSpacerHeightPx(n: number) {
  return Math.min(2000, Math.max(4, Math.round(Number.isFinite(n) ? n : 24)));
}

type EditSpacerToolbarProps = {
  block: Block;
  className?: string;
  heightPx: number;
  onClose: () => void;
  onHeightPxCommit: (heightPx: number) => void;
  persistHeight: (heightPx: number) => void;
};

export function EditSpacerToolbar({
  block,
  className,
  heightPx,
  onClose,
  onHeightPxCommit,
  persistHeight,
}: EditSpacerToolbarProps) {
  const [heightDraft, setHeightDraft] = useState(() => String(heightPx));

  const parseValidHeightDraft = (draft: string) => {
    const parsedInt = parseInt(draft);
    if (isNaN(parsedInt)) {
      return null;
    }
    if (parsedInt < 4 || parsedInt > 2000) {
      return null;
    }
    return parsedInt;
  };

  const commitValidHeight = (nextHeightPx: number) => {
    onHeightPxCommit(nextHeightPx);
    persistHeight(nextHeightPx);
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-full left-0 z-10 mb-2 flex flex-row w-fit gap-2",
        className
      )}
    >
      <div className="flex flex-row flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Close spacer editor"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <SyncToMasterButton block={block} />
        <label className="flex flex-row items-center gap-1.5 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">Height</span>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Spacer height in pixels"
            className="h-7 w-16"
            value={heightDraft}
            onChange={(e) => {
              const nextDraft = e.target.value;
              setHeightDraft(nextDraft);
              const parsed = parseValidHeightDraft(nextDraft);
              if (parsed == null) {
                return;
              }
              commitValidHeight(parsed);
            }}
            // onBlur={() => {
            //   const parsed = parseValidHeightDraft(heightDraft);
            //   if (parsed == null) {
            //     setHeightDraft(String(heightPx));
            //     return;
            //   }
            //   const clamped = clampSpacerHeightPx(parsed);
            //   setHeightDraft(String(clamped));
            //   onHeightPxCommit(clamped);
            //   persistHeight(clamped);
            // }}
          />
          <span className="text-xs">px</span>
        </label>
      </div>
    </div>
  );
}
