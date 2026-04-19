import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageCanvas, SAMPLE_RESUME } from "@/components/page-canvas";
import {
  ProjectDocumentsSidebar,
  ProjectDocumentsSidebarSkeleton,
} from "@/components/project-documents-sidebar";
import { Button } from "@/components/ui/button";
import { eq } from "drizzle-orm";
import { documents, projects } from "@/db/schema";
import db from "@/db/db";
import {
  getBlockMappings,
  getDocumentBlockMappings,
} from "@/blocks/retriever-utils";
import { blockResolverPipeline } from "@/blocks/retriever-pipeline";
import { DEFAULT_TEXT_STYLES } from "@/blocks/renderer-utils";
// import {
//   getProjectById,
//   getProjectDocumentDefinition,
// } from "@/server/project-documents";

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

  // const document = await getProjectDocumentDefinition({
  //   projectId,
  //   documentId,
  // });
  // if (!document) {
  //   notFound();
  // }

  const document = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .get();
  if (!document) {
    notFound();
  }

  const documentBlocks = await getDocumentBlockMappings(documentId);
  const blockMappings = await getBlockMappings(
    Array.from(documentBlocks.keys())
  );

  const blocks = await blockResolverPipeline({
    blockMap: documentBlocks,
    maps: blockMappings,
  });

  console.log("blocks", JSON.stringify(blocks, null, 2));
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
          <PageCanvas
            document={{
              // ...SAMPLE_RESUME,
              name: document.name,
              pageSize: { width: 8.5, height: 11 },
              font: "Times New Roman",
              spacingBelow: {
                about: 11,
                "bullet-list": 11,
                "2-column-list": 11,
                section: 11,
                "v-spacer": 0,
              },
              margins: {
                top: 24,
                bottom: 24,
                left: 24,
                right: 24,
              },
              textStyles: DEFAULT_TEXT_STYLES,
              bulletListStyle: {
                bullet: "•",
                indent: 11,
                gap: 11,
              },
              blocks: blocks,
            }}
            dpi={300}
          />
        </div>
      </section>
    </main>
  );
}
