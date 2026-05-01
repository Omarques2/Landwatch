export type AnalysisBounds = [number, number, number, number];

export function getPreferredAnalysisBounds(input: {
  bounds?: AnalysisBounds | null;
  carBounds?: AnalysisBounds | null;
}): AnalysisBounds | null {
  return input.carBounds ?? input.bounds ?? null;
}

export function getPreferredAnalysisFitMaxZoom(input: {
  sourceMaxZoom: number;
  bounds?: AnalysisBounds | null;
  carBounds?: AnalysisBounds | null;
  printMode?: boolean;
}): number {
  const { sourceMaxZoom, carBounds, printMode = false } = input;
  const baseMaxZoom = printMode ? sourceMaxZoom : Math.min(sourceMaxZoom, 14);
  if (!carBounds) return baseMaxZoom;

  const lngSpan = Math.abs(carBounds[2] - carBounds[0]);
  const latSpan = Math.abs(carBounds[3] - carBounds[1]);
  const span = Math.max(lngSpan, latSpan);

  let preferredMaxZoom = 14;
  if (span <= 0.01) {
    preferredMaxZoom = 18;
  } else if (span <= 0.03) {
    preferredMaxZoom = 17;
  } else if (span <= 0.12) {
    preferredMaxZoom = 16;
  } else if (span <= 0.4) {
    preferredMaxZoom = 15;
  }

  return Math.min(sourceMaxZoom, Math.max(baseMaxZoom, preferredMaxZoom));
}
