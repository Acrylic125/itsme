import { ProjectDocumentsSidebar } from "@/components/project-documents-sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full flex flex-row">
        <div className="w-56 md:w-64 lg:w-72 px-2 py-4 h-screen-safe border-r border-border overflow-y-auto relative">
          <ProjectDocumentsSidebar
            projectId={projectId}
            activeDocumentId={documentId}
          />
        </div>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
