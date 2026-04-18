import { PageCanvas } from "@/components/page-canvas";
import { SAMPLE_RESUME } from "@/components/page-canvas";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="w-full h-full max-w-7xl">
        <PageCanvas document={SAMPLE_RESUME} dpi={300} />
      </div>
    </div>
  );
}
// "use client";

// import * as React from "react";
// import { jsPDF } from "jspdf";
// import { Layer, Rect, Stage, Text } from "react-konva";

// import FileUploadDropzone from "@/components/file-upload-dropzone-1";

// const PAGE_FRAME_WIDTH = 780;
// const PAGE_PADDING = 20;

// type PdfJsModule = {
//   getDocument: (src: { data: ArrayBuffer }) => {
//     promise: Promise<{
//       numPages: number;
//       getPage: (pageNumber: number) => Promise<{
//         getViewport: (options: { scale: number }) => {
//           width: number;
//           height: number;
//         };
//         getTextContent: () => Promise<{
//           items: Array<{
//             str?: string;
//             transform?: number[];
//             width?: number;
//             height?: number;
//           }>;
//         }>;
//       }>;
//       destroy: () => void;
//     }>;
//   };
//   GlobalWorkerOptions: { workerSrc: string };
// };

// let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

// const loadPdfJs = async (): Promise<PdfJsModule> => {
//   if (!pdfJsModulePromise) {
//     pdfJsModulePromise = import("pdfjs-dist").then((mod) => {
//       const typedModule = mod as unknown as PdfJsModule;
//       typedModule.GlobalWorkerOptions.workerSrc = new URL(
//         "pdfjs-dist/build/pdf.worker.min.mjs",
//         import.meta.url
//       ).toString();
//       return typedModule;
//     });
//   }

//   return pdfJsModulePromise;
// };

// type PdfPageRender = {
//   pageNumber: number;
//   width: number;
//   height: number;
//   textItems: PdfTextItem[];
// };

// type PdfTextItem = {
//   text: string;
//   left: number;
//   top: number;
//   fontSize: number;
//   angle: number;
// };

// type ParsedPdf = {
//   fileName: string;
//   pageCount: number;
//   header: string;
//   pages: PdfPageRender[];
// };

// const parsePdfWithJsPdf = async (file: File): Promise<ParsedPdf> => {
//   const pdfJs = await loadPdfJs();
//   const buffer = await file.arrayBuffer();
//   const decoder = new TextDecoder("latin1");
//   const rawText = decoder.decode(buffer);
//   const pdf = new jsPDF();
//   const versionMatch = rawText.match(/%PDF-(\d\.\d)/);

//   const loadingTask = pdfJs.getDocument({ data: buffer });
//   const loadedPdf = await loadingTask.promise;
//   const pageCount = loadedPdf.numPages;
//   const pages: PdfPageRender[] = [];

//   for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
//     const page = await loadedPdf.getPage(pageIndex);
//     const viewport = page.getViewport({ scale: 1 });
//     const targetScale = PAGE_FRAME_WIDTH / viewport.width;
//     const renderViewport = page.getViewport({ scale: targetScale });

//     const textContent = await page.getTextContent();
//     const textItems: PdfTextItem[] = [];

//     for (const item of textContent.items as Array<{
//       str?: string;
//       transform?: number[];
//       width?: number;
//       height?: number;
//     }>) {
//       if (!item.str || !item.transform || item.str.trim().length === 0) {
//         continue;
//       }

//       const [a, b, c, d, e, f] = item.transform;
//       const textScaleY = Math.hypot(c, d);
//       const left = e * targetScale;
//       const top = renderViewport.height - f * targetScale;
//       const fontSize = Math.max(8, textScaleY * targetScale);
//       const angle = Math.atan2(b, a);

//       textItems.push({
//         text: item.str,
//         left,
//         top,
//         fontSize,
//         angle,
//       });
//     }

//     pages.push({
//       pageNumber: pageIndex,
//       width: Math.ceil(renderViewport.width),
//       height: Math.ceil(renderViewport.height),
//       textItems,
//     });
//   }

//   loadedPdf.destroy();

//   // Store parsed metadata using jsPDF's document-properties API so the parser step is tied to jsPDF.
//   pdf.setDocumentProperties({
//     title: file.name,
//     subject: `Detected pages: ${pageCount}`,
//     creator: "itsme PDF canvas parser",
//   });

//   return {
//     fileName: file.name,
//     pageCount,
//     header: versionMatch ? `PDF ${versionMatch[1]}` : "PDF",
//     pages,
//   };
// };

// export default function Home() {
//   const [files, setFiles] = React.useState<File[]>([]);
//   const [parsedPdf, setParsedPdf] = React.useState<ParsedPdf | null>(null);
//   const [isParsing, setIsParsing] = React.useState(false);
//   const [parseError, setParseError] = React.useState<string | null>(null);

//   React.useEffect(() => {
//     const file = files[0];
//     if (!file) {
//       setParsedPdf(null);
//       setParseError(null);
//       return;
//     }

//     let cancelled = false;

//     const run = async () => {
//       setIsParsing(true);
//       setParseError(null);

//       try {
//         const parsed = await parsePdfWithJsPdf(file);
//         if (!cancelled) {
//           setParsedPdf(parsed);
//         }
//       } catch (error) {
//         if (!cancelled) {
//           setParseError(
//             error instanceof Error ? error.message : "Unable to parse PDF"
//           );
//           setParsedPdf(null);
//         }
//       } finally {
//         if (!cancelled) {
//           setIsParsing(false);
//         }
//       }
//     };

//     run();

//     return () => {
//       cancelled = true;
//     };
//   }, [files]);

//   return (
//     <main className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
//       <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
//         <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
//           PDF Upload + Konva Canvas
//         </h1>
//         <p className="text-sm text-zinc-600 dark:text-zinc-300">
//           Upload a PDF, parse it with jsPDF-backed logic, then render a canvas
//           preview.
//         </p>

//         <FileUploadDropzone
//           value={files}
//           onValueChange={setFiles}
//           maxFiles={1}
//           multiple={false}
//           maxSize={10 * 1024 * 1024}
//           accept=".pdf,application/pdf"
//         />

//         {isParsing && (
//           <p className="text-sm text-zinc-600 dark:text-zinc-300">
//             Parsing PDF...
//           </p>
//         )}
//         {parseError && <p className="text-sm text-red-600">{parseError}</p>}

//         {parsedPdf && (
//           <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
//             <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-200">
//               {parsedPdf.fileName} - {parsedPdf.header} - {parsedPdf.pageCount}{" "}
//               page(s)
//             </p>

//             <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 pb-6">
//               {parsedPdf.pages.map((page) => (
//                 <article
//                   key={`page-${page.pageNumber}`}
//                   className="rounded-lg border border-zinc-300 bg-white p-4 shadow-sm"
//                 >
//                   <p className="mb-3 text-sm font-semibold text-zinc-700">
//                     Page {page.pageNumber}
//                   </p>
//                   <div
//                     className="relative mx-auto overflow-hidden rounded border border-zinc-200 bg-white"
//                     style={{
//                       width: page.width + PAGE_PADDING * 2,
//                       height: page.height + PAGE_PADDING * 2,
//                     }}
//                   >
//                     <Stage
//                       width={page.width + PAGE_PADDING * 2}
//                       height={page.height + PAGE_PADDING * 2}
//                     >
//                       <Layer>
//                         <Rect
//                           x={PAGE_PADDING}
//                           y={PAGE_PADDING}
//                           width={page.width}
//                           height={page.height}
//                           fill="#ffffff"
//                         />
//                         {page.textItems.map((item, itemIndex) => (
//                           <Text
//                             key={`page-${page.pageNumber}-text-${itemIndex}`}
//                             x={PAGE_PADDING + item.left}
//                             y={PAGE_PADDING + item.top - item.fontSize}
//                             text={item.text}
//                             fontSize={item.fontSize}
//                             fill="#18181b"
//                             rotation={(item.angle * 180) / Math.PI}
//                           />
//                         ))}
//                       </Layer>
//                     </Stage>
//                   </div>
//                 </article>
//               ))}
//             </div>
//           </section>
//         )}
//       </div>
//     </main>
//   );
// }
