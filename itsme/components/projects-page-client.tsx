"use client";

import FileUploadDropzone from "@/components/file-upload-dropzone-1";
import { parsePdf } from "@/lib/pdf-to-blocks/client";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexMutationState, useQueryWithStatus } from "./convex-hooks";
import Link from "next/link";
import { useState } from "react";

export function ProjectsPageClient() {
  const [files, setFiles] = useState<File[]>([]);

  const projectsQuery = useQueryWithStatus(
    api.documentTasks.getUserProjects,
    {}
  );
  const createProjectMutation = useMutation(
    api.documentTasks.createProjectFromPdf
  );
  const createProject = useConvexMutationState(createProjectMutation, {
    onSuccess: () => setFiles([]),
  });

  const selectedFile = files[0] ?? null;

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
          disabled={createProject.isPending || selectedFile == null}
          onClick={async () => {
            if (!selectedFile) return;
            const parsedInput = await parsePdf(selectedFile);
            console.log(parsedInput);
            await createProject.handle({ input: parsedInput });
          }}
        >
          {createProject.isPending ? "Creating..." : "Create project"}
        </button>
        {selectedFile == null && (
          <p className="text-xs text-zinc-500">
            Upload a PDF first (max 256KB). Parsing happens on the client.
          </p>
        )}
        {createProject.error && (
          <p className="text-sm text-red-600">
            Failed to create project: {createProject.error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Your Projects (USER)</h2>
        {projectsQuery.status !== "success" ? (
          <p className="text-sm text-zinc-600">
            {projectsQuery.status === "pending"
              ? "Loading projects..."
              : "Failed to load projects."}
          </p>
        ) : projectsQuery.data.projects.length === 0 ? (
          <p className="text-sm text-zinc-600">No projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {projectsQuery.data.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}/resume/${project.masterDocumentId}`}
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
