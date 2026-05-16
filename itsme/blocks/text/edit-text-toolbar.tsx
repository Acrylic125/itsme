"use client";

import { useQuery } from "convex/react";
import { TextBlockSchema } from "./schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { Block } from "@/blocks/blocks";
import { SyncToMasterButton } from "@/blocks/sync-to-master-button";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FontSizeInput } from "./font-size-input";
import { LineHeightInput } from "./line-height-input";
import { clampTextEditFontSizePt } from "./schema";

export { clampTextEditFontSizePt } from "./schema";

export const TEXT_STYLE_OPTIONS = [
  { value: "default" as const, label: "Body" },
  { value: "h1" as const, label: "Heading 1" },
  { value: "h2" as const, label: "Heading 2" },
  { value: "h3" as const, label: "Heading 3" },
] as const;

type TextStyleKey = z.infer<typeof TextBlockSchema>["style"];
type TextAlign = z.infer<typeof TextBlockSchema>["align"];

export type BlockFormattingPersistArgs = {
  fontSizePt: number;
  fontWeight: "normal" | "bold";
  lineHeight: number;
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
  block: Block;
  className?: string;
  onClose: () => void;
  blockStyle: TextStyleKey;
  /** Preset (Body / H1–H3): updates the block only. */
  onTextStylePresetSelect: (style: TextStyleKey) => void;
  /** When both are set, loads linked text preset variants from Convex. */
  convexDocumentId: Id<"documents"> | null;
  convexBlockId: Id<"blocks"> | null;
  onContentPresetSelect: (text: string) => void;
  fontSizePt: number;
  onFontSizePtCommit: (pt: number) => void;
  lineHeight: number;
  onLineHeightCommit: (lineHeight: number) => void;
  fontWeightUi: "normal" | "bold";
  onFontWeightUiChange: (w: "normal" | "bold") => void;
  align: TextAlign;
  onAlignChange: (align: TextAlign) => void;
  /** Debounced upstream: persists font size, weight, line height, and align on the text block. */
  persistBlockFormatting: (args: BlockFormattingPersistArgs) => void;
  onSyncDocumentPresetToMatch: () => void;
  onSyncAllDocumentsPresetToMatch: () => void;
  canSyncAllDocuments: boolean;
};

export function EditTextToolbar({
  block,
  className,
  onClose,
  blockStyle,
  onTextStylePresetSelect,
  convexDocumentId,
  convexBlockId,
  onContentPresetSelect,
  fontSizePt,
  onFontSizePtCommit,
  lineHeight,
  onLineHeightCommit,
  fontWeightUi,
  onFontWeightUiChange,
  align,
  onAlignChange,
  persistBlockFormatting,
  onSyncDocumentPresetToMatch,
  onSyncAllDocumentsPresetToMatch,
  canSyncAllDocuments,
}: EditTextToolbarProps) {
  const canFetchTextContentPresets =
    convexDocumentId != null && convexBlockId != null;
  const textContentPresetsQuery = useQuery(
    api.documentTasks.getTextBlockContentVariants,
    canFetchTextContentPresets
      ? { documentId: convexDocumentId, blockId: convexBlockId }
      : "skip"
  );
  const contentPresetVariants = textContentPresetsQuery?.variants ?? [];
  const contentPresetVariantsLoading =
    canFetchTextContentPresets && textContentPresetsQuery === undefined;

  const styleLabel =
    TEXT_STYLE_OPTIONS.find((o) => o.value === blockStyle)?.label ?? "Body";

  const pushFormatting = (overrides?: Partial<BlockFormattingPersistArgs>) => {
    persistBlockFormatting({
      fontSizePt,
      fontWeight: fontWeightUi,
      lineHeight,
      align,
      ...overrides,
    });
  };

  const alignLabel =
    ALIGN_OPTIONS.find((o) => o.value === align)?.label ?? "Align";
  const AlignTriggerIcon =
    ALIGN_OPTIONS.find((o) => o.value === align)?.Icon ?? AlignLeft;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-full left-0 z-10 mb-2 flex flex-row w-fit gap-2",
        className
      )}
    >
      <div className="flex flex-row flex-wrap items-center gap-4 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md">
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
          <SyncToMasterButton block={block} />
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
          <FontSizeInput
            fontSizePt={fontSizePt}
            onFontSizePtCommit={onFontSizePtCommit}
            onPersist={(nextFontSizePt) =>
              pushFormatting({ fontSizePt: nextFontSizePt })
            }
          />
          <LineHeightInput
            lineHeight={lineHeight}
            onLineHeightCommit={onLineHeightCommit}
            onPersist={(nextLineHeight) =>
              pushFormatting({ lineHeight: nextLineHeight })
            }
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
      </div>
      <div className="flex flex-row items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-28 shrink-0 justify-between gap-1 font-normal"
              aria-label="Text alignment"
            >
              <AlignTriggerIcon className="size-4 shrink-0 opacity-70" />
              <span className="truncate">{alignLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-60" />
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
        <div className="min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={contentPresetVariantsLoading}
                className="h-7 w-full justify-between gap-2 py-1.5 font-normal"
                aria-label="Text content presets"
              >
                <span className="min-w-0 whitespace-normal text-left">
                  {contentPresetVariantsLoading ? "Preset…" : "Preset"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-md overflow-x-visible! overflow-y-auto"
            >
              {contentPresetVariantsLoading &&
              contentPresetVariants.length === 0 ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : null}
              {contentPresetVariants.map((variant) => (
                <DropdownMenuItem
                  key={variant}
                  className="h-auto min-h-8 max-w-none items-start whitespace-pre-wrap wrap-break-word py-2"
                  onSelect={() => {
                    onContentPresetSelect(variant);
                  }}
                >
                  {variant}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
