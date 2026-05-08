import { Suspense } from "react";
import { PageCanvas } from "@/components/page-canvas";
import {
  getRetrieverContextData,
  mapBlocks,
  mapStyles,
} from "@/blocks/retriever";
import { PAGE_SIZE } from "@/blocks/blocks";
import { DocumentStoresProvider } from "@/blocks/document-context";
import { Loader2 } from "lucide-react";

export async function CanvasLoader({ documentId }: { documentId: string }) {
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

export default async function ProjectResumePage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      }
    >
      <CanvasLoader documentId={documentId} />
    </Suspense>
  );
}
