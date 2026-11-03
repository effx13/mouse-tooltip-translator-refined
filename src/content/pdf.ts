import { browser } from "wxt/browser";

const viewerUrl = (file: string) =>
  `${browser.runtime.getURL("/pdf.html")}?file=${encodeURIComponent(file)}`;

// Rewriting the document tears down Chrome's internal PDF guest view; the address bar keeps the
// original .pdf URL while our viewer runs in a full-page iframe.
function mountViewer(file: string) {
  document.open();
  document.write(
    '<!doctype html><html><head><meta charset="utf-8">' +
      "<style>html,body{margin:0;padding:0;height:100%;background:#fff;overflow:hidden}" +
      "#mttPdfIframe{border:0;display:block;width:100vw;height:100vh}</style>" +
      '</head><body><iframe id="mttPdfIframe" allow="clipboard-write; clipboard-read"></iframe></body></html>',
  );
  document.close();
  // set after write so the url needs no HTML escaping
  const iframe = document.querySelector<HTMLIFrameElement>("#mttPdfIframe");
  if (iframe) iframe.src = viewerUrl(file);
}

// the viewer posts pdfErrorLoadDocument when it cannot fetch the file (CORS/auth);
// this page shares the PDF's origin, so it can fetch it and hand over a blob url
async function remountFromBlob() {
  try {
    const blob = await (await fetch(location.href)).blob();
    mountViewer(URL.createObjectURL(blob));
  } catch (error) {
    console.log(error);
  }
}

export function takeOverPdf() {
  mountViewer(location.href);
  // document.open() drops window listeners, so register after it
  let fallbackUsed = false;
  window.addEventListener("message", (event: MessageEvent<{ type?: string } | null>) => {
    const viewer = document.querySelector<HTMLIFrameElement>("#mttPdfIframe")?.contentWindow;
    if (event.data?.type !== "pdfErrorLoadDocument" || event.source !== viewer || fallbackUsed)
      return;
    fallbackUsed = true;
    void remountFromBlob();
  });
}
