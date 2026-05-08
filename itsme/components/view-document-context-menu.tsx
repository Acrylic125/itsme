"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTRPC } from "@/server/utils";

export function ViewDocumentContextMenu({
  children,
  projectId,
  documentId,
  isDeleteDisabled = false,
}: {
  children: React.ReactNode;
  projectId: string;
  documentId: string;
  isDeleteDisabled?: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const projectDocumentsQueryKey = trpc.resumes.getProjectDocuments.queryKey({
    projectId,
  });

  const duplicateResumeMutation = useMutation(
    trpc.resumes.duplicateResume.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(projectDocumentsQueryKey, (current) => {
          if (!current) return current;
          const nextDocument = {
            id: result.documentId,
            name: result.documentName,
          };
          const documents = [...current.documents, nextDocument].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
          return { ...current, documents };
        });
        router.push(`/projects/${projectId}/resume/${result.documentId}`);
      },
    })
  );

  const deleteResumeMutation = useMutation(
    trpc.resumes.deleteResume.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(projectDocumentsQueryKey, (current) => {
          if (!current) return current;
          return {
            ...current,
            documents: current.documents.filter(
              (doc) => doc.id !== result.deletedDocumentId
            ),
          };
        });
        if (result.nextDocumentId) {
          router.push(`/projects/${projectId}/resume/${result.nextDocumentId}`);
        } else {
          router.push(`/projects/${projectId}`);
        }
      },
    })
  );

  const isBusy =
    duplicateResumeMutation.isPending || deleteResumeMutation.isPending;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={isBusy}
          onSelect={(e) => {
            e.preventDefault();
            if (isBusy) return;
            duplicateResumeMutation.mutate({
              projectId,
              documentId,
            });
          }}
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={isDeleteDisabled || isBusy}
          onSelect={(e) => {
            e.preventDefault();
            if (isDeleteDisabled || isBusy) return;
            deleteResumeMutation.mutate({
              projectId,
              documentId,
            });
          }}
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
