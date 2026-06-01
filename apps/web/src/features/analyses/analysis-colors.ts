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

export const ANALYSIS_DATASET_COLORS = [
  "#0b5cad",
  "#007c91",
  "#00875a",
  "#3f7d20",
  "#5b8c00",
  "#706c00",
  "#1769aa",
  "#005f73",
  "#00796b",
  "#2e7d32",
  "#558b2f",
  "#827717",
  "#3949ab",
  "#5e35b1",
  "#7b1fa2",
  "#00838f",
  "#00695c",
  "#33691e",
  "#1565c0",
  "#4527a0",
];

export function colorForDataset(code: string): string {
  const input = (code ?? "").toUpperCase();
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ANALYSIS_DATASET_COLORS.length;
  return ANALYSIS_DATASET_COLORS[index] ?? "#0b5cad";
}
