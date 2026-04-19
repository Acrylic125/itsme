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
    const pages: {
      text: {
        x: number;
        y: number;
        content: string;
      }[];
    }[] = [];
    for (
      let pageNumber = 1;
      pageNumber <= pdfDocument.numPages;
      pageNumber += 1
    ) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageTexts: (typeof pages)[number] = { text: [] };
      const parsedPage = PDFPageSchema.parse(page);
      const items = PDFTextItemSchema.array().parse(textContent.items);
      // console.log(items);
      // console.log(page._pageInfo.view);
      // const pageWidth = parsedPage._pageInfo.view[2];
      const pageHeight = parsedPage._pageInfo.view[3];
      items.forEach((item) => {
        const x = Math.round(item.transform[4]);
        const y = pageHeight - Math.round(item.transform[5]);
        pageTexts.text.push({ x, y, content: item.str });
      });
      pages.push({ text: pageTexts.text });
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
