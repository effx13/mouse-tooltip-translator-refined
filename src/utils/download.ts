export function downloadBlob(blob: Blob, filename: string, revokeAfterMs: number) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  // the click only starts the download, which still reads the object URL
  setTimeout(() => URL.revokeObjectURL(href), revokeAfterMs);
}
