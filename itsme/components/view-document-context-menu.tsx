"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function ViewDocumentContextMenu({
  children,
  projectId,
  documentId,
  isDeleteDisabled = false,
  onRename,
}: {
  children: React.ReactNode;
  projectId: string;
  documentId: string;
  isDeleteDisabled?: boolean;
  onRename?: () => void;
}) {
  const router = useRouter();
  const inFlightRef = React.useRef(false);

  const duplicateDocument = useMutation(api.documentTasks.duplicateDocument);
  const deleteDocument = useMutation(api.documentTasks.deleteDocument);

  const convexProjectId = projectId as Id<"projects">;
  const convexDocumentId = documentId as Id<"documents">;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {onRename ? (
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onRename();
            }}
          >
            Rename
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={(e) => {
            e.preventDefault();
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            void duplicateDocument({
              projectId: convexProjectId,
              documentId: convexDocumentId,
            })
              .then((result) => {
                router.push(
                  `/projects/${projectId}/resume/${result.documentId}`
                );
              })
              .finally(() => {
                inFlightRef.current = false;
              });
          }}
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={isDeleteDisabled}
          onSelect={(e) => {
            e.preventDefault();
            if (isDeleteDisabled || inFlightRef.current) return;
            inFlightRef.current = true;
            void deleteDocument({
              projectId: convexProjectId,
              documentId: convexDocumentId,
            })
              .then((result) => {
                if (result.nextDocumentId) {
                  router.push(
                    `/projects/${projectId}/resume/${result.nextDocumentId}`
                  );
                } else {
                  router.push(`/projects/${projectId}`);
                }
              })
              .finally(() => {
                inFlightRef.current = false;
              });
          }}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
