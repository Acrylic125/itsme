import z from "zod";
import { MoveBlockUpdateSchema } from "./apply-block-move";
import { TextBlockUpdateSchema } from "./text/schema";
import { ColumnsSpansUpdateSchema } from "./columns/schema";

export const BlockUpdateSchema = z.union([
  TextBlockUpdateSchema,
  MoveBlockUpdateSchema,
  ColumnsSpansUpdateSchema,
]);
