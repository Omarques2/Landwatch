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

type PrintMapFrozenChild = {
  element: HTMLElement;
  display: string;
};

type PrintMapFrozenState = {
  children: PrintMapFrozenChild[];
  position: string;
  overflow: string;
  background: string;
};

const frozenPrintMapFrames = new WeakMap<HTMLElement, PrintMapFrozenState>();

export function hasFrozenPrintMapFrame(frame: HTMLElement | null | undefined) {
  const frozenImage = frame?.querySelector<HTMLImageElement>(
    "img[data-print-map-freeze='true']",
  );
  return frame?.dataset.printMapFrozen === "true" && Boolean(frozenImage?.src);
}

export function freezePrintMapFrame(frame: HTMLElement, imageDataUrl: string) {
  if (!imageDataUrl) return;

  let state = frozenPrintMapFrames.get(frame);
  const existingImage = frame.querySelector<HTMLImageElement>("img[data-print-map-freeze='true']");

  if (!state) {
    const children = Array.from(frame.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((element) => ({
        element,
        display: element.style.display,
      }));

    state = {
      children,
      position: frame.style.position,
      overflow: frame.style.overflow,
      background: frame.style.background,
    };
    frozenPrintMapFrames.set(frame, state);
  }

  for (const child of state.children) {
    if (child.element.dataset.printMapFreeze === "true") continue;
    child.element.style.display = "none";
  }

  frame.dataset.printMapFrozen = "true";
  if (!frame.style.position) frame.style.position = "relative";
  frame.style.overflow = "hidden";
  frame.style.background = "#e2e8f0";

  const image = existingImage ?? document.createElement("img");
  image.dataset.printMapFreeze = "true";
  image.src = imageDataUrl;
  image.alt = "Mapa da análise";
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.minWidth = "100%";
  image.style.minHeight = "100%";
  image.style.objectFit = "contain";
  image.style.objectPosition = "center";
  image.style.position = "static";
  image.style.background = "#e2e8f0";
  image.style.borderRadius = "inherit";

  if (!existingImage) frame.appendChild(image);
}

export function restorePrintMapFrame(frame: HTMLElement) {
  const state = frozenPrintMapFrames.get(frame);
  if (!state) return;

  frame.querySelectorAll("img[data-print-map-freeze='true']").forEach((image) => image.remove());

  for (const child of state.children) {
    child.element.style.display = child.display;
  }

  frame.style.position = state.position;
  frame.style.overflow = state.overflow;
  frame.style.background = state.background;
  delete frame.dataset.printMapFrozen;
  frozenPrintMapFrames.delete(frame);
}
