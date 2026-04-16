export function formatPrintDatasetLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().replace(/^Prodes\s+/i, "").trim();
}

export function preferredPrintColumns(label: string): number {
  const normalized = formatPrintDatasetLabel(label);
  if (!normalized) return 5;

  if (normalized.length >= 44) return 2;
  if (normalized.length >= 36) return 3;
  if (normalized.length >= 30) return 4;
  return 5;
}

type RankedPrintChip<T> = {
  item: T;
  label: string;
  preferredColumns: number;
};

export function buildPrintChipRows<T>(
  items: T[],
  getLabel: (item: T) => string,
): Array<{ columns: number; items: T[] }> {
  const ranked: RankedPrintChip<T>[] = items
    .map((item) => {
      const label = formatPrintDatasetLabel(getLabel(item));
      return {
        item,
        label,
        preferredColumns: preferredPrintColumns(label),
      };
    })
    .sort((left, right) => {
      if (left.preferredColumns !== right.preferredColumns) {
        return right.preferredColumns - left.preferredColumns;
      }
      if (left.label.length !== right.label.length) {
        return right.label.length - left.label.length;
      }
      return left.label.localeCompare(right.label, "pt-BR");
    });

  const rows: Array<{ columns: number; items: T[] }> = [];

  while (ranked.length > 0) {
    const lead = ranked.shift();
    if (!lead) break;

    const columns = lead.preferredColumns;

    const rowItems: T[] = [lead.item];
    for (let index = 0; index < ranked.length && rowItems.length < columns; ) {
      const current = ranked[index];
      if (current && current.preferredColumns >= columns) {
        rowItems.push(current.item);
        ranked.splice(index, 1);
        continue;
      }
      index += 1;
    }

    rows.push({
      columns,
      items: rowItems,
    });
  }

  return rows;
}
