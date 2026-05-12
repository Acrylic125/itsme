"use client";

import { TextBlockSchema } from "./schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export const TEXT_STYLE_OPTIONS = [
  { value: "default" as const, label: "Body" },
  { value: "h1" as const, label: "Heading 1" },
  { value: "h2" as const, label: "Heading 2" },
  { value: "h3" as const, label: "Heading 3" },
] as const;

export function clampTextEditFontSizePt(n: number) {
  return Math.min(96, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
}

type TextStyleKey = z.infer<typeof TextBlockSchema>["style"];
type TextAlign = z.infer<typeof TextBlockSchema>["align"];

export type BlockFormattingPersistArgs = {
  fontSizePt: number;
  fontWeight: "normal" | "bold";
  align: TextAlign;
};

const ALIGN_OPTIONS: {
  value: TextAlign;
  label: string;
  Icon: typeof AlignLeft;
}[] = [
  { value: "left", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align center", Icon: AlignCenter },
  { value: "right", label: "Align right", Icon: AlignRight },
];

type EditTextToolbarProps = {
  className?: string;
  onClose: () => void;
  blockStyle: TextStyleKey;
  /** Preset (Body / H1–H3): updates the block only. */
  onTextStylePresetSelect: (style: TextStyleKey) => void;
  fontSizePt: number;
  onFontSizePtChange: (pt: number) => void;
  fontWeightUi: "normal" | "bold";
  onFontWeightUiChange: (w: "normal" | "bold") => void;
  align: TextAlign;
  onAlignChange: (align: TextAlign) => void;
  /** Debounced upstream: persists font size, weight, and align on the text block. */
  persistBlockFormatting: (args: BlockFormattingPersistArgs) => void;
  onSyncDocumentPresetToMatch: () => void;
  onSyncAllDocumentsPresetToMatch: () => void;
  canSyncAllDocuments: boolean;
};

export function EditTextToolbar({
  className,
  onClose,
  blockStyle,
  onTextStylePresetSelect,
  fontSizePt,
  onFontSizePtChange,
  fontWeightUi,
  onFontWeightUiChange,
  align,
  onAlignChange,
  persistBlockFormatting,
  onSyncDocumentPresetToMatch,
  onSyncAllDocumentsPresetToMatch,
  canSyncAllDocuments,
}: EditTextToolbarProps) {
  const styleLabel =
    TEXT_STYLE_OPTIONS.find((o) => o.value === blockStyle)?.label ?? "Body";

  const pushFormatting = (overrides?: Partial<BlockFormattingPersistArgs>) => {
    persistBlockFormatting({
      fontSizePt,
      fontWeight: fontWeightUi,
      align,
      ...overrides,
    });
  };

  const alignLabel =
    ALIGN_OPTIONS.find((o) => o.value === align)?.label ?? "Align";

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-full left-0 z-10 mb-2 flex w-fit max-w-[min(100vw-1rem,36rem)] flex-wrap items-center gap-4 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md",
        className
      )}
    >
      <div className="flex flex-row items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label="Close text editor"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-28 shrink-0 justify-between gap-1 font-normal"
              aria-label="Text style"
            >
              <span className="truncate">{styleLabel}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-72">
            {TEXT_STYLE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() => {
                  onTextStylePresetSelect(opt.value);
                }}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void onSyncDocumentPresetToMatch();
              }}
            >
              Update document {styleLabel} to match
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canSyncAllDocuments}
              onSelect={() => {
                if (!canSyncAllDocuments) return;
                void onSyncAllDocumentsPresetToMatch();
              }}
            >
              Update ALL documents {styleLabel} to match
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          type="number"
          min={1}
          max={96}
          aria-label="Font size in points"
          // className="h-7 w-14 shrink-0 rounded-md border border-input bg-background px-1.5 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          value={fontSizePt}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = parseInt(raw, 10);
            const next = clampTextEditFontSizePt(
              raw === "" ? 1 : Number.isNaN(parsed) ? 1 : parsed
            );
            onFontSizePtChange(next);
            pushFormatting({ fontSizePt: next });
          }}
          onBlur={() => {
            const next = clampTextEditFontSizePt(fontSizePt);
            if (next !== fontSizePt) onFontSizePtChange(next);
            pushFormatting({ fontSizePt: next });
          }}
        />
        <Button
          type="button"
          variant={fontWeightUi === "bold" ? "secondary" : "outline"}
          size="icon-sm"
          className="shrink-0"
          aria-label="Bold"
          aria-pressed={fontWeightUi === "bold"}
          onClick={() => {
            const next: "normal" | "bold" =
              fontWeightUi === "bold" ? "normal" : "bold";
            onFontWeightUiChange(next);
            pushFormatting({
              fontWeight: next,
              fontSizePt: clampTextEditFontSizePt(fontSizePt),
            });
          }}
        >
          <Bold className="size-4" />
        </Button>
      </div>
      <div className="w-px h-6 border-l border-border" />
      <div className="flex flex-row items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-28 shrink-0 justify-between gap-1 font-normal"
              aria-label="Text alignment"
            >
              <span className="truncate">{alignLabel}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
              <DropdownMenuItem
                key={value}
                onSelect={() => {
                  onAlignChange(value);
                  pushFormatting({ align: value });
                }}
              >
                <Icon className="size-4 opacity-70" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
