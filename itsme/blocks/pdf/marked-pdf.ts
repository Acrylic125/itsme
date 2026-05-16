import type { PdfStructureTag } from "./types";

type JsPdfInternalEvents = {
  subscribe(topic: string, callback: (...args: unknown[]) => void): string;
};

type JsPdfInternal = {
  events: JsPdfInternalEvents;
  newObject(): number;
  newObjectDeferred(): number;
  newObjectDeferredBegin(objectId: number, doOutput?: boolean): void;
  out(value: string): void;
  write(...values: Array<string | number>): void;
};

type JsPdfPageInfo = {
  objId: number;
  pageNumber: number;
};

export type JsPdfDocument = {
  internal: JsPdfInternal;
  getCurrentPageInfo(): JsPdfPageInfo;
  setPage(pageNumber: number): void;
  setFont(fontName: string, fontStyle?: string): void;
  setFontSize(fontSize: number): void;
  text(
    text: string,
    x: number,
    y: number,
    options?: { baseline?: string }
  ): void;
};

type TaggedContentRecord = {
  tag: Exclude<PdfStructureTag, "Document">;
};

type TaggedPageRecord = {
  pageObjectId: number;
  structParentsKey: number;
  records: TaggedContentRecord[];
};

function escapePdfName(name: string) {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

function escapePdfString(value: string) {
  return `(${value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function renderRefArray(objectIds: number[]) {
  return `[${objectIds.map((objectId) => `${objectId} 0 R`).join(" ")}]`;
}

export class MarkedPdf {
  private markInfoObjectId: number | null = null;

  constructor(
    private readonly doc: JsPdfDocument,
    private readonly language = "en-US"
  ) {
    const { internal } = this.doc;
    internal.events.subscribe("postPutResources", () => {
      this.writeMarkInfoObject();
    });
    internal.events.subscribe("putCatalog", () => {
      this.writeCatalogEntries();
    });
  }

  beginMarkedContent(tag: Exclude<PdfStructureTag, "Document">) {
    const { internal } = this.doc;
    const tagName = escapePdfName(tag);
    internal.write(`/${tagName} <<>> BDC`);
    return () => {
      internal.write("EMC");
    };
  }

  private writeMarkInfoObject() {
    if (this.markInfoObjectId !== null) {
      return;
    }
    const { internal } = this.doc;
    this.markInfoObjectId = internal.newObject();
    internal.write("<< /Type /MarkInfo /Marked true >>");
    internal.write("endobj");
  }

  private writeCatalogEntries() {
    const { internal } = this.doc;
    if (this.markInfoObjectId !== null) {
      internal.write(`/MarkInfo ${this.markInfoObjectId} 0 R`);
    }
    internal.write(`/Lang ${escapePdfString(this.language)}`);
  }
}
