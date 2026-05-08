import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageCanvas } from "@/components/page-canvas";
import { ProjectDocumentsSidebar } from "@/components/project-documents-sidebar";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import db from "@/db/db";
import {
  getRetrieverContextData,
  mapBlocks,
  mapStyles,
} from "@/blocks/retriever";
import { PAGE_SIZE } from "@/blocks/blocks";
import { DocumentStoresProvider } from "@/blocks/document-context";

export async function getProjectById(projectId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      userId: projects.userId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
}

export default async function ProjectResumePage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;

  const project = await getProjectById(projectId);
  if (!project) {
    notFound();
  }

  const ctxData = await getRetrieverContextData(documentId);
  const pipelineBlocks = await mapBlocks({ data: ctxData });
  const document = ctxData.document;
  const mainLayout = ctxData.mainLayout;
  const styleSheet = mapStyles({ data: ctxData });

  const renderedDocument = {
    id: documentId,
    name: document.name,
    blocks: pipelineBlocks,
    styleSheet,
    pageSize: PAGE_SIZE,
    layout: mainLayout
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((layoutItem) => layoutItem.blockId),
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full flex flex-row">
        <div className="w-56 md:w-64 lg:w-72 px-2 py-4 h-screen-safe border-r border-border overflow-y-auto relative">
          <Suspense
            fallback={
              <ProjectDocumentsSidebar
                projectId={projectId}
                activeDocumentId={documentId}
                projectName={project.name}
                isLoading
              />
            }
          >
            <ProjectDocumentsSidebar
              projectId={projectId}
              activeDocumentId={documentId}
              projectName={project.name}
              isLoading={false}
            />
          </Suspense>
          <div></div>
        </div>

        <div className="flex-1">
          <DocumentStoresProvider document={renderedDocument} dpi={300}>
            <PageCanvas document={renderedDocument} dpi={300} />
          </DocumentStoresProvider>
        </div>
      </div>
    </div>
  );
}
