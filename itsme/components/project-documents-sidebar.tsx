import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { documents } from "@/db/schema";
import db from "@/db/db";
import { asc, eq } from "drizzle-orm";
import { Button } from "./ui/button";

export async function ProjectDocumentsSidebar({
  projectId,
  activeDocumentId,
}: {
  projectId: string;
  activeDocumentId: string;
}) {
  const projectDocuments = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.name));

  return (
    <aside className="w-full flex flex-col gap-2 px-1 py-4 h-fit border border-border rounded-xl bg-card">
      <h2 className="text-muted-foreground text-sm px-3">Documents</h2>
      {projectDocuments.length === 0 ? (
        <p className="px-2 py-1 text-muted-foreground">
          No documents in this project.
        </p>
      ) : (
        <ul className="w-full flex flex-col">
          {projectDocuments.map((document) => {
            const isActive = document.id === activeDocumentId;
            return (
              <li key={document.id}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className="w-full justify-start px-3 text-base py-1 h-fit"
                >
                  <Link href={`/projects/${projectId}/resume/${document.id}`}>
                    {document.name}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export function ProjectDocumentsSidebarSkeleton() {
  return (
    <aside className="w-full flex flex-col gap-2 px-1 py-4 h-fit border border-border rounded-xl bg-card">
      <h2 className="text-muted-foreground text-sm px-3">Documents</h2>
      <ul className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </ul>
    </aside>
  );
}
