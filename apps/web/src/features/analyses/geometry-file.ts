export const MAX_GEOMETRY_FILE_BYTES = 50 * 1024 * 1024;

export function validateGeometryFile(file: File | null | undefined): string | null {
  if (!file) return 'Selecione um arquivo de geometria.';
  if (file.size > MAX_GEOMETRY_FILE_BYTES) return 'O arquivo excede 50MB.';
  const name = file.name.toLowerCase();
  if (!name.endsWith('.kml') && !name.endsWith('.zip')) {
    return 'Envie um arquivo KML ou shapefile ZIP.';
  }
  return null;
}
