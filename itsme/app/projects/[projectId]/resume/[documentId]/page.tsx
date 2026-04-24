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
import { documents, projects } from "@/db/schema";
import db from "@/db/db";
import { SAMPLE_DOCUMENT } from "@/blocks/renderer";
import { blockResolverPipeline } from "@/blocks/retriever-pipeline";
import {
  getRetrieverContextData,
  getDocumentMainLayout,
} from "@/blocks/retriever-utils";
import { benchmarkAsync } from "@/lib/utils";

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

  const _documents = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  const document = _documents[0];
  if (!document) {
    notFound();
  }

  // Benchmark
  const pipelineBlocks = await benchmarkAsync(
    "blockResolverPipeline",
    async () =>
      blockResolverPipeline({
        data: await benchmarkAsync(
          "getDocumentBlockMappings",
          async () => await getRetrieverContextData(documentId)
        ),
        // mainLayout: await getDocumentMainLayout(documentId),
      })
  );
  const mainLayout = await getDocumentMainLayout(documentId);

  const renderedDocument = {
    ...SAMPLE_DOCUMENT,
    name: document.name ?? "Untitled Document",
    blocks: pipelineBlocks,
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
