"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Document } from "./document-blocks";

const DocumentRenderContext = createContext<Document | null>(null);

export function DocumentRenderProvider({
  document,
  children,
}: {
  document: Document;
  children: ReactNode;
}) {
  return (
    <DocumentRenderContext.Provider value={document}>
      {children}
    </DocumentRenderContext.Provider>
  );
}

export function useDocumentRender(): Document {
  const ctx = useContext(DocumentRenderContext);
  if (!ctx) {
    throw new Error("DocumentRenderProvider not provided");
  }
  return ctx;
}

