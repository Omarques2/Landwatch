function titleCaseWord(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function formatDatasetLabel(code: string): string {
  const cleaned = (code ?? "")
    .replace(/[-.]/g, " ")
    .replace(/__+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const base = cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => (/\d{4}$/.test(part) ? part : titleCaseWord(part)))
    .join(" ");
  return base.trim();
}

export function colorForDataset(code: string): string {
  const input = (code ?? "").toUpperCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const palette = [
    "#1f77b4",
    "#ff7f0e",
    "#2ca02c",
    "#d62728",
    "#9467bd",
    "#8c564b",
    "#e377c2",
    "#7f7f7f",
    "#bcbd22",
    "#17becf",
    "#4e79a7",
    "#f28e2b",
    "#e15759",
    "#76b7b2",
    "#59a14f",
    "#edc949",
    "#af7aa1",
    "#ff9da7",
    "#9c755f",
    "#bab0ac",
  ];
  const index = Math.abs(hash) % palette.length;
  return palette[index] ?? "#1f77b4";
}
