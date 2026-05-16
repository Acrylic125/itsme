import type { z } from "zod";
import type { TextBlockSchema } from "../text/schema";

export type PdfStructureTag =
  | "Document"
  | "P"
  | "H1"
  | "H2"
  | "H3"
  | "LI"
  | "SPAN";

export function mapTextStyleToPdfTag(
  style: z.infer<typeof TextBlockSchema>["style"]
): Extract<PdfStructureTag, "P" | "H1" | "H2" | "H3"> {
  switch (style) {
    case "h1":
      return "H1";
    case "h2":
      return "H2";
    case "h3":
      return "H3";
    case "default":
      return "P";
  }
}
