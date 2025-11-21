export function triggerDownload(
  filename: string,
  content: string | BlobPart[],
  type: string,
): void {
  const blob = new Blob(Array.isArray(content) ? content : [content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
