/** fetch→blob→native `<a download>` so a cross-origin bucket file downloads
 *  instead of navigating (the `download` attr alone is ignored cross-origin). */
export async function triggerDownload(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
