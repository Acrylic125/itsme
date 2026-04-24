import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageCanvas } from "@/components/page-canvas";
import {
  ProjectDocumentsSidebar,
  ProjectDocumentsSidebarSkeleton,
} from "@/components/project-documents-sidebar";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import db from "@/db/db";
import {
  getRetrieverContextData,
  mapBlocks,
  mapStyles,
} from "@/blocks/retriever";
import { PAGE_SIZE } from "@/blocks/blocks";

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
    <main className="mx-auto flex min-h-screen w-full max-w-[1400px] gap-6 px-6 py-10">
      <Suspense fallback={<ProjectDocumentsSidebarSkeleton />}>
        <ProjectDocumentsSidebar
          projectId={projectId}
          activeDocumentId={documentId}
        />
      </Suspense>

      <section className="min-w-0 flex-1 space-y-3">
        <Button className="w-fit" variant="outline" asChild>
          <Link href="/projects" className="text-sm">
            Projects
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-zinc-700">
            {document.name} ({document.id})
          </p>
        </div>
        <div className="w-full">
          <PageCanvas document={renderedDocument} dpi={300} />
        </div>
      </section>
    </main>
  );
}
