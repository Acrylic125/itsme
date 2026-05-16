"use client";

import type { Block } from "./blocks";
import { SyncToMasterButton } from "./sync-to-master-button";

export function ContainerBlockToolbar({ block }: { block: Block }) {
  return (
    <div className="pointer-events-auto absolute bottom-full left-0 z-10 mb-2 flex w-fit flex-row">
      <div className="flex flex-row items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md">
        <SyncToMasterButton block={block} />
      </div>
    </div>
  );
}
