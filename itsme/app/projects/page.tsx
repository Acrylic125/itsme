import { ProjectsPageClient } from "@/components/projects-page-client";
import db from "@/db/db";
import { projects } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

const USER_ID = "USER";

export default async function ProjectsPage() {
  const userProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
    })
    .from(projects)
    .where(eq(projects.userId, USER_ID))
    .orderBy(asc(projects.name));

  return <ProjectsPageClient initialProjects={userProjects} />;
}
