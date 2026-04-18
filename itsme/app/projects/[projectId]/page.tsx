import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getProjectById,
  getProjectMasterDocument,
} from "@/server/project-documents";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  const masterDocument = await getProjectMasterDocument(projectId);

  if (!masterDocument) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-6 py-10">
        <Link
          href="/projects"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to projects
        </Link>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-zinc-600">
          No master resume is linked to this project yet.
        </p>
      </main>
    );
  }

  redirect(`/projects/${projectId}/resume/${masterDocument.id}`);
}
