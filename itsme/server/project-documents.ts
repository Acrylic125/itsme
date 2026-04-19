import db from "@/db/db";
import { documents, projectMasterDocuments, projects } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
// import { getDocumentDefinitionById as reconstructDocumentDefinition } from "@/server/document-definition";

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

export async function getProjectMasterDocument(projectId: string) {
  const masterRows = await db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(projectMasterDocuments)
    .innerJoin(documents, eq(projectMasterDocuments.documentId, documents.id))
    .where(eq(projectMasterDocuments.projectId, projectId))
    .limit(1);

  return masterRows[0] ?? null;
}

export async function getProjectDocuments(projectId: string) {
  return db
    .select({
      id: documents.id,
      name: documents.name,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(asc(documents.name));
}

// export async function getProjectDocumentDefinition(args: {
//   projectId: string;
//   documentId: string;
// }) {
//   const { projectId, documentId } = args;
//   const documentRow = await db
//     .select({
//       id: documents.id,
//       name: documents.name,
//     })
//     .from(documents)
//     .where(
//       and(eq(documents.projectId, projectId), eq(documents.id, documentId))
//     )
//     .get();

//   if (!documentRow) {
//     return null;
//   }

//   const definition = await reconstructDocumentDefinition({
//     documentId,
//     documentName: documentRow.name,
//   });
//   return {
//     id: documentRow.id,
//     name: documentRow.name,
//     definition,
//   };
// }
