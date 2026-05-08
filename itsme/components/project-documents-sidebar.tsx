import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { documents } from "@/db/schema";
import db from "@/db/db";
import { asc, eq } from "drizzle-orm";
import { Button } from "./ui/button";
import { ArrowLeft, ChevronLeft } from "lucide-react";

export async function ProjectDocumentsSidebar({
  projectId,
  activeDocumentId,
  projectName,
  isLoading,
}: {
  projectId: string;
  activeDocumentId: string;
  projectName: string;
  isLoading: boolean;
}) {
  const projectDocuments = isLoading
    ? null
    : await db
        .select({
          id: documents.id,
          name: documents.name,
        })
        .from(documents)
        .where(eq(documents.projectId, projectId))
        .orderBy(asc(documents.name));

  let documentEntriesEle = null;
  if (projectDocuments === null) {
    documentEntriesEle = (
      <div className="flex flex-col gap-1">
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
        <Skeleton className="w-full h-10" />
      </div>
    );
  } else if (projectDocuments.length <= 0) {
    documentEntriesEle = (
      <p className="px-2 py-1 text-muted-foreground">
        No documents in this project.
      </p>
    );
  } else {
    documentEntriesEle = projectDocuments.map((document) => {
      const isActive = document.id === activeDocumentId;
      return (
        <li key={document.id}>
          <Button
            variant={isActive ? "default" : "ghost"}
            className="w-full justify-start px-2 text-base py-1 h-fit"
          >
            <Link href={`/projects/${projectId}/resume/${document.id}`}>
              {document.name}
            </Link>
          </Button>
        </li>
      );
    });
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
