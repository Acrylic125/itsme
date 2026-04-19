import {
  DocumentDefinitionSchema,
  type DocumentDefinition,
} from "@/blocks/schema";

function createEmptyDocument(name: string): DocumentDefinition {
  return {
    name,
    pageSize: { width: 8.5, height: 11 },
    font: "Times New Roman",
    spacingBelow: {
      about: 11,
      "bullet-list": 11,
      "2-column-list": 11,
      section: 11,
      "v-spacer": 0,
    },
    margins: {
      top: 24,
      bottom: 24,
      left: 24,
      right: 24,
    },
    textStyles: {
      default: { fontSize: 11, fontWeight: "normal", lineHeight: 1.2 },
      h1: { fontSize: 16, fontWeight: "normal", lineHeight: 1.2 },
      h2: { fontSize: 14, fontWeight: "bold", lineHeight: 1.2 },
      h3: { fontSize: 12, fontWeight: "bold", lineHeight: 1.2 },
      h4: { fontSize: 11, fontWeight: "bold", lineHeight: 1.2 },
    },
    bulletListStyle: {
      bullet: "•",
      indent: 11,
      gap: 11,
    },
    blocks: [],
  };
}

// export async function getDocumentDefinitionById(args: {
//   documentId: string;
//   documentName: string;
// }): Promise<DocumentDefinition> {
//   const { documentId, documentName } = args;
//   const emptyDocument = createEmptyDocument(documentName);
//   const topLevelBlocks = await reconstructBlocksForDocument({ documentId });
//   if (topLevelBlocks.length === 0) {
//     return emptyDocument;
//   }

//   const candidateDocument: DocumentDefinition = {
//     ...emptyDocument,
//     blocks: topLevelBlocks,
//   };
//   const parsedDocument = DocumentDefinitionSchema.safeParse(candidateDocument);
//   return parsedDocument.success ? parsedDocument.data : candidateDocument;
// }
