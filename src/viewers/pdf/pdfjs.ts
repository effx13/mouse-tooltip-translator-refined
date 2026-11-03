import { GlobalWorkerOptions } from "pdfjs-dist";
import { browser } from "wxt/browser";

export {
  AnnotationEditorType,
  getDocument,
  getPdfFilenameFromUrl,
  PasswordResponses,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
// must stay below the pdfjs-dist imports: pdf_viewer.mjs reads globalThis.pdfjsLib on load
export {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";

GlobalWorkerOptions.workerSrc = browser.runtime.getURL("/pdfjs/pdf.worker.min.mjs");

const assetDir = (dir: "cmaps" | "standard_fonts" | "wasm" | "iccs") =>
  `${browser.runtime.getURL(`/pdfjs/${dir}`)}/`;

export const documentOptions = () => ({
  cMapUrl: assetDir("cmaps"),
  cMapPacked: true,
  standardFontDataUrl: assetDir("standard_fonts"),
  wasmUrl: assetDir("wasm"),
  iccUrl: assetDir("iccs"),
  // the extension CSP has no unsafe-eval
  isEvalSupported: false,
});
