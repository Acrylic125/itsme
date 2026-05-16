import type { Block } from "../blocks";
import type {
  BlockRenderLayoutResult,
  BlockRendererContext,
} from "../renderer-types";
import type { PdfDrawSurface } from "./pdf-draw-context-types";

export function drawLayoutTree(args: {
  layout: BlockRenderLayoutResult;
  renderContext: BlockRendererContext;
  pdf: PdfDrawSurface;
  blocksById: Map<string, Block>;
}) {
  const { layout, renderContext, pdf, blocksById } = args;
  const block = blocksById.get(layout.blockId);
  if (!block) {
    return;
  }

  const renderer = renderContext.renderers[block.type];
  renderer.renderPdf(block as never, renderContext, pdf, layout as never);

  if (block.type === "list" || block.type === "columns") {
    return;
  }

  for (const child of layout.children) {
    drawLayoutTree({
      layout: child,
      renderContext,
      pdf,
      blocksById,
    });
  }
}
