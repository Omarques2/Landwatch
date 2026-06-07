export function filenameFromContentDisposition(value: unknown) {
  if (typeof value !== "string") return "";
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
  const asciiMatch = value.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1]?.trim() ?? "";
}

export function saveBlobAsFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
