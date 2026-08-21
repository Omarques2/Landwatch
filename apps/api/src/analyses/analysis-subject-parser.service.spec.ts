import { BadRequestException } from '@nestjs/common';
import {
  AnalysisSubjectParserService,
  type ParsedAnalysisSubject,
} from './analysis-subject-parser.service';

describe('AnalysisSubjectParserService', () => {
  const parser = new AnalysisSubjectParserService();

  it('converts a KML polygon into a normalized MultiPolygon subject', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <Placemark>
            <name>Fazenda A</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    -49.2,-22.0,0 -49.1,-22.0,0 -49.1,-21.9,0 -49.2,-21.9,0 -49.2,-22.0,0
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </Document>
      </kml>
    `);

    const result: ParsedAnalysisSubject = await parser.parse(
      kml,
      'fazenda.kml',
      'application/vnd.google-earth.kml+xml',
    );

    expect(result.sourceFormat).toBe('KML');
    expect(result.featureCount).toBe(1);
    expect(result.geometry.type).toBe('MultiPolygon');
    expect(result.geometry.coordinates[0]?.[0]?.[0]).toEqual([-49.2, -22]);
  });

  it('rejects files without polygonal geometry', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Placemark><Point><coordinates>-49.2,-22.0,0</coordinates></Point></Placemark>
      </kml>
    `);

    await expect(
      parser.parse(kml, 'ponto.kml', 'application/xml'),
    ).rejects.toEqual(
      expect.objectContaining<BadRequestException>({
        response: expect.objectContaining({
          code: 'GEOMETRY_POLYGON_REQUIRED',
        }),
      }),
    );
  });

  it('requires a zipped shapefile with a projection file', async () => {
    await expect(
      parser.parse(
        Buffer.from('not a zip'),
        'fazenda.shp',
        'application/octet-stream',
      ),
    ).rejects.toEqual(
      expect.objectContaining<BadRequestException>({
        response: expect.objectContaining({ code: 'SHAPEFILE_ZIP_REQUIRED' }),
      }),
    );
  });
});
