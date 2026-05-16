"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";
import { clampTextEditFontSizePt } from "./schema";

type FontSizeInputProps = {
  fontSizePt: number;
  onFontSizePtCommit: (pt: number) => void;
  onPersist: (pt: number) => void;
};

function parseValidFontSizeDraft(draft: string) {
  const trimmed = draft.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 96) {
    return null;
  }
  return parsed;
}

export function FontSizeInput({
  fontSizePt,
  onFontSizePtCommit,
  onPersist,
}: FontSizeInputProps) {
  const [fontSizeDraft, setFontSizeDraft] = useState(() => String(fontSizePt));

  useEffect(() => {
    setFontSizeDraft(String(fontSizePt));
  }, [fontSizePt]);

  const commitValidFontSizeDebounced = useDebouncedCallback(
    (nextFontSizePt: number) => {
      onFontSizePtCommit(nextFontSizePt);
      onPersist(nextFontSizePt);
    },
    300
  );

  useEffect(() => {
    return () => {
      commitValidFontSizeDebounced.cancel();
    };
  }, [commitValidFontSizeDebounced]);

  return (
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
      onBlur={() => {
        const parsed = parseValidFontSizeDraft(fontSizeDraft);
        if (parsed == null) {
          setFontSizeDraft(String(fontSizePt));
          return;
        }
        const clamped = clampTextEditFontSizePt(parsed);
        setFontSizeDraft(String(clamped));
        onFontSizePtCommit(clamped);
        onPersist(clamped);
      }}
    />
  );
}
