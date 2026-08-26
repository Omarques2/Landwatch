import { describe, expect, it } from 'vitest';
import { validateGeometryFile } from './geometry-file';

describe('validateGeometryFile', () => {
  it('accepts KML, KMZ, and ZIP shapefile uploads under the size limit', () => {
    expect(validateGeometryFile(new File(['kml'], 'fazendas.kml'))).toBeNull();
    expect(validateGeometryFile(new File(['kmz'], 'fazendas.kmz'))).toBeNull();
    expect(validateGeometryFile(new File(['zip'], 'fazendas.zip'))).toBeNull();
  });

  it('rejects unsupported formats with a user-facing message', () => {
    expect(validateGeometryFile(new File(['geojson'], 'fazendas.geojson'))).toBe(
      'Envie um arquivo KML, KMZ ou shapefile ZIP.',
    );
  });

  it('rejects files larger than 50MB', () => {
    const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'grande.kml');
    expect(validateGeometryFile(file)).toBe('O arquivo excede 50MB.');
  });
});
