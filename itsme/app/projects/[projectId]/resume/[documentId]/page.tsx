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

export default async function ProjectResumePage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

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
    <DocumentStoresProvider document={renderedDocument} dpi={300}>
      <PageCanvas document={renderedDocument} dpi={300} />
    </DocumentStoresProvider>
  );
}
