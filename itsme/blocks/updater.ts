import z from "zod";
import { TextBlockUpdateSchema } from "./text/schema";

export const BlockUpdateSchema = z.union([TextBlockUpdateSchema]);
