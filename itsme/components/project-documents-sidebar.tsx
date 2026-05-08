"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";
import { ViewDocumentContextMenu } from "@/components/view-document-context-menu";
import { useTRPC } from "@/server/utils";

export function ProjectDocumentsSidebar({
  projectId,
  activeDocumentId,
  projectName,
}: {
  projectId: string;
  activeDocumentId: string;
  projectName: string;
}) {
  const trpc = useTRPC();
  const projectDocumentsQuery = useQuery(
    trpc.resumes.getProjectDocuments.queryOptions({ projectId })
  );

  let documentEntriesEle = null;
  if (projectDocumentsQuery.isPending) {
    documentEntriesEle = (
      <div className="flex flex-col gap-1">
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
      </div>
    );
  } else if (projectDocumentsQuery.isError) {
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
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId;
          const isMaster = document.id === masterDocumentId;
          return (
            <li key={document.id}>
              <ViewDocumentContextMenu
                projectId={projectId}
                documentId={document.id}
                isDeleteDisabled={isMaster}
              >
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className="w-full justify-start px-2 text-base py-1 h-fit"
                  asChild
                >
                  <Link href={`/projects/${projectId}/resume/${document.id}`}>
                    {document.name}
                  </Link>
                </Button>
              </ViewDocumentContextMenu>
            </li>
          );
        })}
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
        <h1 className="px-2 text-2xl font-bold line-clamp-2">{projectName}</h1>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm px-2">Documents</h2>
        {documentEntriesEle}
      </div>
    </aside>
  );
}
