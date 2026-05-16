"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, Upload } from "lucide-react";
import { useStore } from "zustand/react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Block } from "./blocks";
import { useDocument } from "./document-context";
import { hasBlockDiffToMaster } from "./master-diff";

export function SyncToMasterButton({ block }: { block: Block }) {
  const {
    document,
    masterDocument,
    masterDocumentId,
    documentStore,
  } = useDocument();
  const clientIdMappings = useStore(documentStore, (state) => state.clientIdMappings);
  const syncBlockToMaster = useMutation(api.documentTasks.syncBlockToMaster);
  const [isPending, setIsPending] = useState(false);

  const convexBlockId = useMemo(() => {
    if (block.id.startsWith("CLIENT_ID:")) {
      const resolved = clientIdMappings.clientToConvex.get(block.id);
      return resolved ? (resolved as Id<"blocks">) : null;
    }
    return block.id as Id<"blocks">;
  }, [block.id, clientIdMappings]);

  const hasDiff = useMemo(
    () =>
      hasBlockDiffToMaster({
        document,
        masterDocument,
        blockId: block.id,
        clientToConvex: clientIdMappings.clientToConvex,
      }),
    [block.id, clientIdMappings.clientToConvex, document, masterDocument]
  );

  const convexDocumentId = document
    ? ((document as { id: Id<"documents"> }).id as Id<"documents">)
    : null;
  const canShow =
    document != null &&
    masterDocument != null &&
    masterDocumentId != null &&
    document.id !== masterDocumentId &&
    convexDocumentId != null &&
    convexBlockId != null &&
    hasDiff;

  if (!canShow) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={async () => {
        if (!convexDocumentId || !convexBlockId || isPending) {
          return;
        }
        setIsPending(true);
        try {
          await syncBlockToMaster({
            documentId: convexDocumentId,
            blockId: convexBlockId,
          });
        } finally {
          setIsPending(false);
        }
      }}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Upload className="size-4" />
      )}
      Sync to master
    </Button>
  );
}
