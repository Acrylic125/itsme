import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getProjectDocuments } from "@/server/project-documents";

export async function ProjectDocumentsSidebar({
  projectId,
  activeDocumentId,
}: {
  projectId: string;
  activeDocumentId: string;
}) {
  const projectDocuments = await getProjectDocuments(projectId);

  return (
    <aside className="w-72 shrink-0 rounded-xl border border-border bg-card p-3">
      <h2 className="px-2 pb-2 text-sm font-semibold">Documents</h2>
      {projectDocuments.length === 0 ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          No documents in this project.
        </p>
      ) : (
        <ul className="space-y-1">
          {projectDocuments.map((document) => {
            const isActive = document.id === activeDocumentId;
            return (
              <li key={document.id}>
                <Link
                  href={`/projects/${projectId}/resume/${document.id}`}
                  className={cn(
                    "block rounded-md px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {document.name}
                </Link>
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
    <aside className="w-72 shrink-0 rounded-xl border border-border bg-card p-3">
      <Skeleton className="mb-3 h-4 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </aside>
  );
}
