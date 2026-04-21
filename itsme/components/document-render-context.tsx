"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DocumentSchema } from "@/blocks/renderer";
import { z } from "zod";

const DocumentRenderContext = createContext<z.infer<
  typeof DocumentSchema
> | null>(null);

export function DocumentRenderProvider({
  document,
  children,
}: {
  document: z.infer<typeof DocumentSchema>;
  children: ReactNode;
}) {
  return (
    <DocumentRenderContext.Provider value={document}>
      {children}
    </DocumentRenderContext.Provider>
  );
}

export function useDocumentRender(): z.infer<typeof DocumentSchema> {
  const ctx = useContext(DocumentRenderContext);
  if (!ctx) {
    throw new Error("DocumentRenderProvider not provided");
  }
  return ctx;
}
