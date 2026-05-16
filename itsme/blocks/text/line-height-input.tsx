"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clampTextEditLineHeight, TEXT_LINE_HEIGHT_PRESETS } from "./schema";

type LineHeightInputProps = {
  lineHeight: number;
  onLineHeightCommit: (lineHeight: number) => void;
  onPersist: (lineHeight: number) => void;
};

function formatLineHeightLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function parseValidLineHeightDraft(draft: string) {
  const parsed = parseFloat(draft);
  if (isNaN(parsed) || parsed < 1 || parsed > 4) {
    return null;
  }
  return parsed;
}

export function LineHeightInput({
  lineHeight,
  onLineHeightCommit,
  onPersist,
}: LineHeightInputProps) {
  const [lineHeightDraft, setLineHeightDraft] = useState(() =>
    formatLineHeightLabel(lineHeight)
  );
  const [prevLineHeight, setPrevLineHeight] = useState(lineHeight);
  const [isCustomInputFocused, setIsCustomInputFocused] = useState(false);

  if (lineHeight !== prevLineHeight) {
    setPrevLineHeight(lineHeight);
    if (!isCustomInputFocused) {
      setLineHeightDraft(formatLineHeightLabel(lineHeight));
    }
  }

  const commitLineHeightToParent = (nextLineHeight: number) => {
    const clamped = clampTextEditLineHeight(nextLineHeight);
    onLineHeightCommit(clamped);
    onPersist(clamped);
    return clamped;
  };

  const commitLineHeightDebounced = useDebouncedCallback(
    commitLineHeightToParent,
    300
  );

  const commitLineHeightWithDraft = (nextLineHeight: number) => {
    const clamped = commitLineHeightToParent(nextLineHeight);
    setLineHeightDraft(formatLineHeightLabel(clamped));
  };

  useEffect(() => {
    return () => {
      commitLineHeightDebounced.cancel();
    };
  }, [commitLineHeightDebounced]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 min-w-16 shrink-0 justify-between gap-1 px-2 font-normal"
          aria-label="Line height"
        >
          <span>{formatLineHeightLabel(lineHeight)}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        {TEXT_LINE_HEIGHT_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset}
            onSelect={() => {
              commitLineHeightWithDraft(preset);
            }}
          >
            {formatLineHeightLabel(preset)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Custom</DropdownMenuLabel>
        <div>
          <Input
            type="text"
            // inputMode="text"
            aria-label="Custom line height"
            className="h-7"
            value={lineHeightDraft}
            onChange={(e) => {
              const nextDraft = e.target.value;
              setLineHeightDraft(nextDraft);
              const parsed = parseValidLineHeightDraft(nextDraft);
              if (parsed == null) {
                return;
              }
              commitLineHeightDebounced(parsed);
            }}
            onFocus={() => {
              setIsCustomInputFocused(true);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            onBlur={() => {
              setIsCustomInputFocused(false);
              commitLineHeightDebounced.cancel();
              const parsed = parseValidLineHeightDraft(lineHeightDraft);
              if (parsed == null) {
                setLineHeightDraft(formatLineHeightLabel(lineHeight));
                return;
              }
              commitLineHeightWithDraft(parsed);
            }}
          />
        </div>
        {/* <DropdownMenuItem
          className="cursor-text p-1.5 focus:bg-transparent data-highlighted:bg-transparent"
          onSelect={(e) => e.preventDefault()}
        ></DropdownMenuItem> */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
