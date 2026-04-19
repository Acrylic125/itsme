"use client";

import FileUploadDropzone from "@/components/file-upload-dropzone-1";
import { useTRPC } from "@/server/utils";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { z } from "zod";

type ProjectListItem = {
  id: string;
  name: string;
};

const MAX_PDF_SIZE_BYTES = 256 * 1024;
const PDF_MAGIC_HEADER = "%PDF-";
const TEXT_SPACER = "<SPACER>";
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
{
  "str": "BENEDICT TAN",
  "dir": "ltr",
  "width": 114.67767353108363,
  "height": 16.0000005,
  "transform": [
    16.0000005,
    0,
    0,
    16.0000005,
    248.662577,
    744.6624984325
  ],
  "fontName": "g_d2_f1",
  "hasEOL": false
}
 */
const PDFTextItemSchema = z.object({
  str: z.string(),
  dir: z.enum(["ltr", "rtl"]),
  width: z.number(),
  height: z.number(),
  transform: z.tuple([
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
    z.number(),
  ]),
  fontName: z.string(),
  hasEOL: z.boolean(),
});

const PDFPageSchema = z.object({
  _pageInfo: z.object({
    view: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
});

type ParsedPdfTextItem = z.infer<typeof PDFTextItemSchema>;

type PageTextChunk = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  isBold: boolean;
  content: string;
};

function getFontWeightHint(fontName: string): "bold" | "normal" {
  return /bold|black|heavy|semibold|demi/i.test(fontName) ? "bold" : "normal";
}

type TextTag = "h1" | "h2" | "h3" | "p";

function getChunkStyleKey(chunk: PageTextChunk): string {
  return `${chunk.fontSize}|${chunk.isBold ? 1 : 0}`;
}

function getTagForRank(args: { rank: number; pairCount: number }): TextTag {
  const { rank, pairCount } = args;
  if (pairCount <= 1) return "p";
  if (pairCount === 2) return rank === 0 ? "h1" : "p";
  if (pairCount === 3) {
    if (rank === 0) return "h1";
    if (rank === 1) return "h2";
    return "p";
  }
  if (rank === 0) return "h1";
  if (rank === 1) return "h2";
  if (rank === 2) return "h3";
  return "p";
}

function buildChunkTagMap(chunks: PageTextChunk[]): Map<string, TextTag> {
  const uniqueStyles = [
    ...new Set(chunks.map((chunk) => getChunkStyleKey(chunk))),
  ]
    .map((key) => {
      const [fontSizeRaw, isBoldRaw] = key.split("|");
      return {
        key,
        fontSize: Number(fontSizeRaw),
        isBold: isBoldRaw === "1",
      };
    })
    .sort((a, b) => {
      if (a.fontSize !== b.fontSize) return b.fontSize - a.fontSize;
      if (a.isBold === b.isBold) return 0;
      return a.isBold ? -1 : 1;
    });

  const pairCount = uniqueStyles.length;
  return new Map(
    uniqueStyles.map((style, index) => [
      style.key,
      getTagForRank({ rank: index, pairCount }),
    ])
  );
}

function wrapChunkWithTag(args: {
  chunk: PageTextChunk;
  tagMap: Map<string, TextTag>;
}) {
  const tag = args.tagMap.get(getChunkStyleKey(args.chunk)) ?? "p";
  return `<${tag}>${args.chunk.content}</${tag}>`;
}

function groupTextItemsIntoChunks(args: {
  items: ParsedPdfTextItem[];
  pageHeight: number;
}): PageTextChunk[] {
  const normalized = args.items
    .map((item) => {
      const x = Math.round(item.transform[4]);
      const y = args.pageHeight - Math.round(item.transform[5]);
      return {
        x,
        y,
        width: Math.max(1, Math.round(item.width)),
        height: Math.max(1, Math.round(item.height)),
        fontSize: Math.max(
          1,
          Math.round(Math.max(item.height, Math.abs(item.transform[0])))
        ),
        isBold: getFontWeightHint(item.fontName) === "bold",
        content: item.str.trim(),
      };
    })
    .filter((item) => item.content.length > 0)
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  const groups: PageTextChunk[] = [];
  for (const item of normalized) {
    const previous = groups[groups.length - 1];
    if (!previous) {
      groups.push(item);
      continue;
    }

    const sameLineTolerance = Math.max(previous.height, item.height) * 0.5;
    const sameLine = Math.abs(previous.y - item.y) <= sameLineTolerance;
    const previousRight = previous.x + previous.width;
    const horizontalGap = item.x - previousRight;
    const shouldJoin = sameLine && horizontalGap >= -2;

    if (!shouldJoin) {
      groups.push(item);
      continue;
    }

    const superCloseThreshold = Math.max(
      1,
      Math.round(Math.min(previous.height, item.height) * 0.25)
    );
    const separator = horizontalGap <= superCloseThreshold ? "" : TEXT_SPACER;
    previous.content = `${previous.content}${separator}${item.content}`;
    const mergedRight = Math.max(previousRight, item.x + item.width);
    previous.width = mergedRight - previous.x;
    previous.height = Math.max(previous.height, item.height);
    previous.fontSize = Math.max(previous.fontSize, item.fontSize);
    previous.isBold = previous.isBold || item.isBold;
    previous.y = Math.round((previous.y + item.y) / 2);
  }

  return groups;
}

export function ProjectsPageClient({
  initialProjects,
}: {
  initialProjects: ProjectListItem[];
}) {
  const trpc = useTRPC();
  const [files, setFiles] = useState<File[]>([]);

  const createProjectMutation = useMutation(
    trpc.resumes.createProject.mutationOptions({
      onSuccess: () => {
        // TODO: route to created project when backend returns real id.
      },
    })
  );

  const selectedFile = files[0] ?? null;

  async function parsePdfOnClient(file: File) {
    if (file.type !== "application/pdf") {
      throw new Error("Only PDF files are supported.");
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      throw new Error("PDF must be 256KB or smaller.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
    if (header !== PDF_MAGIC_HEADER) {
      throw new Error("Invalid PDF file.");
    }

    const loadingTask = getDocument({
      data: bytes,
    } as unknown as Parameters<typeof getDocument>[0]);
    const pdfDocument = await loadingTask.promise;
    // const pages: Array<{ pageNumber: number; textItems: string[] }> = [];
    const pages: Array<{ pageNumber: number; textItems: string[] }> = [];
    for (
      let pageNumber = 1;
      pageNumber <= pdfDocument.numPages;
      pageNumber += 1
    ) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const parsedPage = PDFPageSchema.parse(page);
      const items = PDFTextItemSchema.array().parse(textContent.items);
      // console.log(items);
      // console.log(page._pageInfo.view);
      // const pageWidth = parsedPage._pageInfo.view[2];
      const pageHeight = parsedPage._pageInfo.view[3];
      const groupedItems = groupTextItemsIntoChunks({ items, pageHeight });
      const tagMap = buildChunkTagMap(groupedItems);
      pages.push({
        pageNumber,
        textItems: groupedItems.map((item) =>
          wrapChunkWithTag({ chunk: item, tagMap })
        ),
      });
      // const textItems = textContent.items.flatMap((item) =>
      //   "str" in item ? [item.str] : []
      // );
      // pages.push({ pageNumber, textItems });
    }

    console.log(pages);
    return {
      name: file.name,
      type: file.type as "application/pdf",
      size: file.size,
      pageCount: pdfDocument.numPages,
      pages,
    };
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-zinc-600">
          Upload a PDF to create a new project. For now, this uses mock resume
          blocks.
        </p>
        <div className="max-w-md">
          <FileUploadDropzone
            value={files}
            onValueChange={setFiles}
            maxFiles={1}
            multiple={false}
            maxSize={256 * 1024}
            accept=".pdf,application/pdf"
          />
        </div>
        <button
          type="button"
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={createProjectMutation.isPending || selectedFile == null}
          onClick={async () => {
            if (!selectedFile) return;
            const parsedPdf = await parsePdfOnClient(selectedFile);
            createProjectMutation.mutate({
              parsedPdf,
            });
          }}
        >
          {createProjectMutation.isPending ? "Creating..." : "Create project"}
        </button>
        {selectedFile == null && (
          <p className="text-xs text-zinc-500">
            Upload a PDF first (max 256KB). Parsing happens on the client.
          </p>
        )}
        {createProjectMutation.error && (
          <p className="text-sm text-red-600">
            Failed to create project: {createProjectMutation.error.message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your Projects (USER)</h2>
        {initialProjects.length === 0 ? (
          <p className="text-sm text-zinc-600">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {initialProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {project.name} ({project.id})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
