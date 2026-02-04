export const CAR_LOADING_MESSAGES = [
  "Localizando imóveis na coordenada...",
  "Buscando CARs na coordenada informada...",
  "Preparando geometrias para o mapa...",
  "Quase lá, finalizando carregamento...",
];

export function getLoadingMessage(index: number): {
  message: string;
  nextIndex: number;
} {
  const safeIndex = Number.isFinite(index) ? Math.max(0, index) : 0;
  const clampedIndex = safeIndex % CAR_LOADING_MESSAGES.length;
  const message = CAR_LOADING_MESSAGES[clampedIndex] ?? "Buscando CARs...";
  const nextIndex = (clampedIndex + 1) % CAR_LOADING_MESSAGES.length;
  return { message, nextIndex };
}
