"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { useDebouncedCallback } from "use-debounce";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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
  /** When both are set, loads linked text preset variants from Convex. */
  convexDocumentId: Id<"documents"> | null;
  convexBlockId: Id<"blocks"> | null;
  onContentPresetSelect: (text: string) => void;
  fontSizePt: number;
  onFontSizePtCommit: (pt: number) => void;
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
  convexDocumentId,
  convexBlockId,
  onContentPresetSelect,
  fontSizePt,
  onFontSizePtCommit,
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
  const [fontSizeDraft, setFontSizeDraft] = useState(() => String(fontSizePt));

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
  const AlignTriggerIcon =
    ALIGN_OPTIONS.find((o) => o.value === align)?.Icon ?? AlignLeft;

  const parseValidFontSizeDraft = (draft: string) => {
    const trimmed = draft.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 96) {
      return null;
    }

    return parsed;
  };

  const commitValidFontSizeDebounced = useDebouncedCallback(
    (nextFontSizePt: number) => {
      onFontSizePtCommit(nextFontSizePt);
      pushFormatting({ fontSizePt: nextFontSizePt });
    },
    300
  );

  useEffect(() => {
    return () => {
      commitValidFontSizeDebounced.cancel();
    };
  }, [commitValidFontSizeDebounced]);

  return (
    <div
      className={cn(
        // Temporarily removed: max-w-[min(100vw-1rem,36rem)]
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
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Font size in points"
            className="h-7 w-12"
            value={fontSizeDraft}
            onChange={(e) => {
              const nextDraft = e.target.value;
              setFontSizeDraft(nextDraft);
              const parsed = parseValidFontSizeDraft(nextDraft);
              if (parsed == null) {
                return;
              }
              commitValidFontSizeDebounced(parsed);
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
        {/* <div className="w-px h-6 shrink-0 self-center border-l border-border" /> */}

        {/* <div className="flex flex-row items-center gap-1"></div> */}
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
        {/* {contentPresetVariants.length > 0 || contentPresetVariantsLoading ? (
          
        ) : null} */}
      </div>
    </div>
  );
}
