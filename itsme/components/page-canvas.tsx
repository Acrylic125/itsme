"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
  type ComponentType,
} from "react";
import { Layer, Rect, Stage, Text, Group } from "react-konva";
import {
  BlockWithSection,
  DocumentDefinition,
  Document,
  layoutDocument,
  resolveDocument,
  PageLayout,
  LayoutBlockRenderers,
  LayoutBlockComponentProps,
  TextStyle,
  estimateLineCount,
  getHeadingStyle,
  getProportionalColumnWidths,
} from "./document-blocks";

export { SAMPLE_RESUME } from "./document-blocks";

const PAGE_GAP = 24;

const DocumentRenderContext = createContext<Document | null>(null);

function useDocumentRender(): Document {
  const ctx = useContext(DocumentRenderContext);
  if (!ctx) {
    throw new Error("DocumentRenderContext not provided");
  }
  return ctx;
}

export function PageCanvas({
  document,
  dpi = 300,
}: {
  document: DocumentDefinition;
  dpi?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      setContainerWidth(
        el.clientWidth || el.getBoundingClientRect().width || 0
      );
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const resolvedDocument = useMemo(() => resolveDocument(document), [document]);
  const pages = useMemo<PageLayout[]>(
    () => layoutDocument(resolvedDocument, BLOCK_RENDERERS),
    [resolvedDocument]
  );

  const pageWidth = resolvedDocument.pageSize.width;
  const pageHeight = resolvedDocument.pageSize.height;

  const scale =
    containerWidth != null && containerWidth > 0
      ? containerWidth / pageWidth
      : 1;

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {containerWidth !== null && (
        <DocumentRenderContext.Provider value={resolvedDocument}>
          <DocumentStage
            pages={pages}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            scale={scale}
            dpi={dpi}
          />
        </DocumentRenderContext.Provider>
      )}
    </div>
  );
}

type DocumentStageProps = {
  pages: PageLayout[];
  pageWidth: number;
  pageHeight: number;
  scale: number;
  dpi: number;
};

function DocumentStage({
  pages,
  pageWidth,
  pageHeight,
  scale,
  dpi,
}: DocumentStageProps) {
  const stageWidth = pageWidth * scale;
  const stageHeight =
    pages.length * (pageHeight + PAGE_GAP) * scale - PAGE_GAP * scale;

  return (
    <Stage width={stageWidth} height={stageHeight} pixelRatio={dpi / 96}>
      <Layer>
        {pages.map((page, pageIndex) => {
          const yOffset = pageIndex * (pageHeight + PAGE_GAP) * scale;

          return (
            <Group key={pageIndex} y={yOffset} scaleX={scale} scaleY={scale}>
              <Rect
                x={0}
                y={0}
                width={pageWidth}
                height={pageHeight}
                stroke="#e5e5e5"
                fill="#ffffff"
                cornerRadius={2}
                perfectDrawEnabled={false}
                listening={false}
              />
              {page.blocks.map((block) => {
                const Component =
                  block.component as unknown as ComponentType<LayoutBlockComponentProps>;
                return (
                  <Component
                    key={block.id}
                    x={block.x}
                    y={block.y}
                    width={block.width}
                    height={block.height}
                  />
                );
              })}
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}

type HeaderLayout = {
  leftText: string;
  rightText: string;
  allocLeft: number;
  allocRight: number;
  height: number;
  style: TextStyle;
};

function computeHeaderLayout(args: {
  document: Document;
  leftText: string;
  rightText: string;
  style: TextStyle;
  totalWidth: number;
}): HeaderLayout {
  const { document, leftText, rightText, style, totalWidth } = args;
  const { left: allocLeft, right: allocRight } = getProportionalColumnWidths({
    leftText,
    rightText,
    fontFamily: document.font,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    totalWidth,
  });

  const leftLines = estimateLineCount(
    leftText,
    document.font,
    style.fontSize,
    style.fontWeight,
    allocLeft
  );
  const rightLines = estimateLineCount(
    rightText,
    document.font,
    style.fontSize,
    style.fontWeight,
    allocRight
  );
  const lines = Math.max(leftLines, rightLines || 1);
  const height = lines * style.fontSize * style.lineHeight;

  return { leftText, rightText, allocLeft, allocRight, height, style };
}

function renderSpacer({
  block,
  parent,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "v-spacer" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  return {
    estimatedDimensions: { width: parent.width, height: block.height },
    component: () => null,
  };
}

function renderAbout({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "about" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const headerStyle = getHeadingStyle(1, headingOffset, document.textStyles);
  const subtitleStyle = document.textStyles.default;
  const subtitleLine = block.points.join(" | ");

  const headerLines = estimateLineCount(
    block.header,
    document.font,
    headerStyle.fontSize,
    headerStyle.fontWeight,
    parent.width
  );
  const headerHeight =
    headerLines * headerStyle.fontSize * headerStyle.lineHeight;

  const subtitleLines = estimateLineCount(
    subtitleLine,
    document.font,
    subtitleStyle.fontSize,
    subtitleStyle.fontWeight,
    parent.width
  );
  const subtitleHeight =
    subtitleLines * subtitleStyle.fontSize * subtitleStyle.lineHeight;

  const estimatedHeight = headerHeight + subtitleHeight;

  return {
    estimatedDimensions: { width: parent.width, height: estimatedHeight },
    component: ({ x, y, width, height }: LayoutBlockComponentProps) => (
      <AboutBlockNode
        x={x}
        y={y}
        width={width}
        height={height}
        headerText={block.header}
        subtitleText={subtitleLine}
        headerStyle={headerStyle}
        subtitleStyle={subtitleStyle}
        headerHeight={headerHeight}
      />
    ),
  };
}

function renderSection({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "section" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const style = getHeadingStyle(2, headingOffset, document.textStyles);
  const header = computeHeaderLayout({
    document,
    leftText: block.header[0],
    rightText: block.header[1],
    style,
    totalWidth: parent.width,
  });

  return {
    estimatedDimensions: { width: parent.width, height: header.height },
    component: ({ x, y, width, height }: LayoutBlockComponentProps) => (
      <TwoColumnHeaderNode
        x={x}
        y={y}
        width={width}
        height={height}
        header={header}
      />
    ),
  };
}

function renderBulletList({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "bullet-list" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const headerStyle = getHeadingStyle(2, headingOffset, document.textStyles);
  const bodyStyle = document.textStyles.default;
  const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

  const header = block.header
    ? computeHeaderLayout({
        document,
        leftText: block.header[0],
        rightText: block.header[1],
        style: headerStyle,
        totalWidth: parent.width,
      })
    : null;

  const bulletX = document.bulletListStyle.indent;
  const textX = bulletX + document.bulletListStyle.gap;
  const textWidth = parent.width - textX;

  const rows = block.points.map((point) => {
    const lines = estimateLineCount(
      point,
      document.font,
      bodyStyle.fontSize,
      bodyStyle.fontWeight,
      textWidth
    );
    const height = Math.max(1, lines) * bodyLineHeight;
    return { text: point, height };
  });

  const rowY: number[] = [];
  let y = header?.height ?? 0;
  for (const row of rows) {
    rowY.push(y);
    y += row.height;
  }

  return {
    estimatedDimensions: { width: parent.width, height: y },
    component: ({ x, y, width, height }: LayoutBlockComponentProps) => (
      <BulletListBlockNode
        x={x}
        y={y}
        width={width}
        height={height}
        header={header}
        rows={rows.map((r, idx) => ({ ...r, y: rowY[idx] }))}
        bodyStyle={bodyStyle}
      />
    ),
  };
}

function renderTwoColumnList({
  document,
  block,
  parent,
  headingOffset,
}: {
  document: Document;
  block: Extract<BlockWithSection, { type: "2-column-list" }>;
  parent: { width: number; height: number };
  headingOffset: number;
}) {
  const headerStyle = getHeadingStyle(2, headingOffset, document.textStyles);
  const bodyStyle = document.textStyles.default;
  const bodyLineHeight = bodyStyle.fontSize * bodyStyle.lineHeight;

  const header = block.header
    ? computeHeaderLayout({
        document,
        leftText: block.header[0],
        rightText: block.header[1],
        style: headerStyle,
        totalWidth: parent.width,
      })
    : null;

  const rows = block.points
    .map(([leftText, rightText]) => {
      const { left: allocLeft, right: allocRight } =
        getProportionalColumnWidths({
          leftText,
          rightText,
          fontFamily: document.font,
          fontSize: bodyStyle.fontSize,
          fontWeight: bodyStyle.fontWeight,
          totalWidth: parent.width,
        });

      if (allocLeft <= 0 && allocRight <= 0) {
        return null;
      }

      const leftLines = estimateLineCount(
        leftText,
        document.font,
        bodyStyle.fontSize,
        bodyStyle.fontWeight,
        allocLeft
      );
      const rightLines = estimateLineCount(
        rightText,
        document.font,
        bodyStyle.fontSize,
        bodyStyle.fontWeight,
        allocRight
      );

      const lines = Math.max(leftLines, rightLines || 1);
      const height = Math.max(1, lines) * bodyLineHeight;

      return { leftText, rightText, allocLeft, allocRight, height };
    })
    .filter(Boolean) as Array<{
    leftText: string;
    rightText: string;
    allocLeft: number;
    allocRight: number;
    height: number;
  }>;

  const rowY: number[] = [];
  let y = header?.height ?? 0;
  for (const row of rows) {
    rowY.push(y);
    y += row.height;
  }

  return {
    estimatedDimensions: { width: parent.width, height: y },
    component: ({ x, y, width, height }: LayoutBlockComponentProps) => (
      <TwoColumnListBlockNode
        x={x}
        y={y}
        width={width}
        height={height}
        header={header}
        rows={rows.map((r, idx) => ({ ...r, y: rowY[idx] }))}
        bodyStyle={bodyStyle}
      />
    ),
  };
}

const BLOCK_RENDERERS: LayoutBlockRenderers = {
  about: renderAbout,
  section: renderSection,
  "bullet-list": renderBulletList,
  "2-column-list": renderTwoColumnList,
  "v-spacer": renderSpacer,
};

function AboutBlockNode({
  x,
  y,
  width,
  height,
  headerText,
  subtitleText,
  headerStyle,
  subtitleStyle,
  headerHeight,
}: LayoutBlockComponentProps & {
  headerText: string;
  subtitleText: string;
  headerStyle: TextStyle;
  subtitleStyle: TextStyle;
  headerHeight: number;
}) {
  const document = useDocumentRender();
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Text
        x={0}
        y={0}
        width={width}
        text={headerText}
        fontFamily={document.font}
        fontSize={headerStyle.fontSize}
        lineHeight={headerStyle.lineHeight}
        fontStyle={headerStyle.fontWeight === "bold" ? "bold" : "normal"}
        align="center"
        fill="#000000"
        perfectDrawEnabled={false}
      />
      <Text
        x={0}
        y={headerHeight}
        width={width}
        text={subtitleText}
        fontFamily={document.font}
        fontSize={subtitleStyle.fontSize}
        lineHeight={subtitleStyle.lineHeight}
        fontStyle={subtitleStyle.fontWeight === "bold" ? "bold" : "normal"}
        align="center"
        fill="#000000"
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

function TwoColumnHeaderNode({
  x,
  y,
  width,
  height,
  header,
}: LayoutBlockComponentProps & { header: HeaderLayout }) {
  const document = useDocumentRender();
  return (
    <Group x={x} y={y} width={width} height={height}>
      <Text
        x={0}
        y={0}
        width={header.allocLeft}
        text={header.leftText}
        fontFamily={document.font}
        fontSize={header.style.fontSize}
        lineHeight={header.style.lineHeight}
        fontStyle={header.style.fontWeight === "bold" ? "bold" : "normal"}
        align="left"
        fill="#000000"
        perfectDrawEnabled={false}
      />
      {header.rightText && (
        <Text
          x={header.allocLeft}
          y={0}
          width={header.allocRight}
          text={header.rightText}
          fontFamily={document.font}
          fontSize={header.style.fontSize}
          lineHeight={header.style.lineHeight}
          fontStyle={header.style.fontWeight === "bold" ? "bold" : "normal"}
          align="right"
          fill="#000000"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}

function BulletListBlockNode({
  x,
  y,
  width,
  height,
  header,
  rows,
  bodyStyle,
}: LayoutBlockComponentProps & {
  header: HeaderLayout | null;
  rows: Array<{ text: string; height: number; y: number }>;
  bodyStyle: TextStyle;
}) {
  const document = useDocumentRender();
  const bulletX = document.bulletListStyle.indent;
  const textX = bulletX + document.bulletListStyle.gap;
  const textWidth = width - textX;

  return (
    <Group x={x} y={y} width={width} height={height}>
      {header && (
        <TwoColumnHeaderNode
          x={0}
          y={0}
          width={width}
          height={header.height}
          header={header}
        />
      )}
      {rows.map((row, idx) => (
        <Group key={idx} y={row.y}>
          <Text
            x={bulletX}
            y={0}
            width={document.bulletListStyle.gap}
            text={document.bulletListStyle.bullet}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
          <Text
            x={textX}
            y={0}
            width={textWidth}
            text={row.text}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </Group>
  );
}

function TwoColumnListBlockNode({
  x,
  y,
  width,
  height,
  header,
  rows,
  bodyStyle,
}: LayoutBlockComponentProps & {
  header: HeaderLayout | null;
  rows: Array<{
    leftText: string;
    rightText: string;
    allocLeft: number;
    allocRight: number;
    height: number;
    y: number;
  }>;
  bodyStyle: TextStyle;
}) {
  const document = useDocumentRender();
  return (
    <Group x={x} y={y} width={width} height={height}>
      {header && (
        <TwoColumnHeaderNode
          x={0}
          y={0}
          width={width}
          height={header.height}
          header={header}
        />
      )}
      {rows.map((row, idx) => (
        <Group key={idx} y={row.y}>
          <Text
            x={0}
            y={0}
            width={row.allocLeft}
            text={row.leftText}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="left"
            fill="#000000"
            perfectDrawEnabled={false}
          />
          <Text
            x={row.allocLeft}
            y={0}
            width={row.allocRight}
            text={row.rightText}
            fontFamily={document.font}
            fontSize={bodyStyle.fontSize}
            lineHeight={bodyStyle.lineHeight}
            fontStyle={bodyStyle.fontWeight === "bold" ? "bold" : "normal"}
            align="right"
            fill="#000000"
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </Group>
  );
}
