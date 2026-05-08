import { ProjectDocumentsSidebar } from "@/components/project-documents-sidebar";
import db from "@/db/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  const project = await db
    .select({
      id: projects.id,
      name: projects.name,
      userId: projects.userId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) {
    notFound();
  }
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full flex flex-row">
        <div className="w-56 md:w-64 lg:w-72 px-2 py-4 h-screen-safe border-r border-border overflow-y-auto relative">
          <ProjectDocumentsSidebar
            projectId={projectId}
            activeDocumentId={documentId}
            projectName={project.name}
          />
        </div>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
