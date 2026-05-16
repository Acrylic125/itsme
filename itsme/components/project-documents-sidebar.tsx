"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ArrowLeft } from "lucide-react";
import { ViewDocumentContextMenu } from "@/components/view-document-context-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQueryWithStatus } from "./convex-hooks";

function ProjectDocumentSidebarItem({
  projectId,
  document,
  isActive,
  isMaster,
}: {
  projectId: string;
  document: { id: Id<"documents">; name: string };
  isActive: boolean;
  isMaster: boolean;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(document.name);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameDocument = useMutation(api.documentTasks.renameDocument);

  useEffect(() => {
    if (!isRenaming || !textareaRef.current) {
      return;
    }
    const textarea = textareaRef.current;
    textarea.focus();
    textarea.select();
  }, [isRenaming]);

  const cancelRename = () => {
    setIsRenaming(false);
    setDraftName(document.name);
  };

  const commitRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === document.name) {
      cancelRename();
      return;
    }

    try {
      await renameDocument({
        projectId: projectId as Id<"projects">,
        documentId: document.id,
        name: trimmed,
      });
      setIsRenaming(false);
    } catch {
      cancelRename();
    }
  };

  return (
    <ViewDocumentContextMenu
      projectId={projectId}
      documentId={document.id}
      isDeleteDisabled={isMaster}
      onRename={() => {
        setDraftName(document.name);
        setIsRenaming(true);
      }}
    >
      <Button
        variant={isActive ? "default" : "ghost"}
        className="w-full justify-start px-2 text-base py-1 h-fit"
        asChild={!isRenaming}
      >
        {isRenaming ? (
          <Textarea
            ref={textareaRef}
            value={draftName}
            rows={1}
            className="min-h-0 h-auto w-full resize-none border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void commitRename();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onClick={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <Link href={`/projects/${projectId}/resume/${document.id}`}>
            {document.name}
          </Link>
        )}
      </Button>
    </ViewDocumentContextMenu>
  );
}

export function ProjectDocumentsSidebar({
  projectId,
  activeDocumentId,
}: {
  projectId: string;
  activeDocumentId: string;
}) {
  const convexProjectId = projectId as Id<"projects">;
  const projectQuery = useQueryWithStatus(api.documentTasks.getProject, {
    projectId: convexProjectId,
  });
  const projectDocumentsQuery = useQueryWithStatus(
    api.documentTasks.getProjectDocuments,
    { projectId: convexProjectId }
  );

  let documentEntriesEle = null;
  if (projectDocumentsQuery.status === "pending") {
    documentEntriesEle = (
      <div className="flex flex-col gap-1">
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
      </div>
    );
  } else if (projectDocumentsQuery.status === "error") {
    documentEntriesEle = (
      <p className="px-2 py-1 text-destructive">Failed to load documents.</p>
    );
  } else if (projectDocumentsQuery.data.documents.length <= 0) {
    documentEntriesEle = (
      <p className="px-2 py-1 text-muted-foreground">
        No documents in this project.
      </p>
    );
  } else {
    const { documents, masterDocumentId } = projectDocumentsQuery.data;
    documentEntriesEle = (
      <div className="flex flex-col">
        {documents.map((document) => (
          <li key={document.id}>
            <ProjectDocumentSidebarItem
              projectId={projectId}
              document={document}
              isActive={document.id === activeDocumentId}
              isMaster={document.id === masterDocumentId}
            />
          </li>
        ))}
      </div>
    );
  }

  return (
    <aside className="w-full flex flex-col gap-4 py-2 h-fit">
      <div className="flex flex-col">
        <Button asChild variant="ghost" className="text-primary w-fit px-2">
          <Link href="/projects">
            <ArrowLeft />
            <span className="font-bold">My Projects</span>
          </Link>
        </Button>
        <h1 className="px-2 text-2xl font-bold line-clamp-2">
          {projectQuery.status === "success"
            ? (projectQuery.data?.project.name ?? "Project")
            : "Project"}
        </h1>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm px-2">Documents</h2>
        {documentEntriesEle}
      </div>
    </aside>
  );
}
