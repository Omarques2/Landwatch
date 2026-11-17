import { BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import {
  AnalysisSubjectParserService,
  type ParsedAnalysisSubject,
} from './analysis-subject-parser.service';

describe('AnalysisSubjectParserService', () => {
  const parser = new AnalysisSubjectParserService();

  it('reads GeoJSON geometry, feature and feature collection without changing other upload formats', () => {
    const polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-49, -20],
          [-48, -20],
          [-48, -19],
          [-49, -20],
        ],
      ],
    };
    for (const input of [
      polygon,
      { type: 'Feature', geometry: polygon },
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: polygon }],
      },
    ]) {
      expect(parser.parseGeoJson(Buffer.from(JSON.stringify(input)))).toEqual({
        type: 'MultiPolygon',
        coordinates: [polygon.coordinates],
      });
    }
    expect(() => parser.parseGeoJson(Buffer.from('{'))).toThrow(
      BadRequestException,
    );
    expect(() =>
      parser.parseGeoJson(Buffer.from('{"type":"Point","coordinates":[0,0]}')),
    ).toThrow(BadRequestException);
  });

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

  it('converts a nearly closed KML LineString into a polygon', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Placemark>
          <LineString>
            <coordinates>
              -48.9492,-19.6276,0 -48.9488,-19.6261,0 -48.9494,-19.6251,0
              -48.9503,-19.6237,0 -48.94922,-19.62763,0
            </coordinates>
          </LineString>
        </Placemark>
      </kml>
    `);

    const result = await parser.parse(kml, 'limite.kml', 'application/xml');

    expect(result.sourceFormat).toBe('KML');
    expect(result.featureCount).toBe(1);
    expect(result.geometry.type).toBe('MultiPolygon');
    expect(result.geometry.coordinates[0]?.[0]?.at(-1)).toEqual(
      result.geometry.coordinates[0]?.[0]?.[0],
    );
  });

  it('does not convert an open KML LineString into an analysis area', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Placemark>
          <LineString><coordinates>0,0 1,0 1,1</coordinates></LineString>
        </Placemark>
      </kml>
    `);

    await expect(
      parser.parse(kml, 'linha.kml', 'application/xml'),
    ).rejects.toEqual(
      expect.objectContaining<BadRequestException>({
        response: expect.objectContaining({
          code: 'GEOMETRY_POLYGON_REQUIRED',
        }),
      }),
    );
  });

  it('falls back to the first point for CAR search when a KMZ has only a pin', async () => {
    const zip = new JSZip();
    zip.file(
      'doc.kml',
      `
        <kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
          <Document><Placemark><name>Minuana</name><Point>
            <gx:drawOrder>1</gx:drawOrder>
            <coordinates>-49.18290085903316,-7.369046586536931,0</coordinates>
          </Point></Placemark></Document>
        </kml>
      `,
    );
    const kmz = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(
      parser.parseCarSearch(
        kmz,
        'Minuana.kmz',
        'application/vnd.google-earth.kmz',
      ),
    ).resolves.toEqual({
      kind: 'point',
      lat: -7.369046586536931,
      lng: -49.18290085903316,
    });
  });

  it('prefers polygons over points for CAR search', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2"><Folder>
        <Placemark><Point><coordinates>-48.9,-19.6</coordinates></Point></Placemark>
        <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
          -48.9,-19.6 -48.8,-19.6 -48.8,-19.5 -48.9,-19.5 -48.9,-19.6
        </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      </Folder></kml>
    `);

    const result = await parser.parseCarSearch(kml, 'area.kml');

    expect(result.kind).toBe('geometry');
  });

  it('rejects CAR search files without polygon or point', async () => {
    const kml = Buffer.from(`
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Placemark><LineString><coordinates>-49.2,-22 -49.1,-22</coordinates></LineString></Placemark>
      </kml>
    `);

    await expect(parser.parseCarSearch(kml, 'linha.kml')).rejects.toEqual(
      expect.objectContaining<BadRequestException>({
        response: expect.objectContaining({
          code: 'GEOMETRY_POLYGON_OR_POINT_REQUIRED',
        }),
      }),
    );
  });

  it('reads a KMZ document containing polygon features', async () => {
    const zip = new JSZip();
    zip.file(
      'doc.kml',
      `
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Folder>
            <Placemark><Point><coordinates>-48.9,-19.6</coordinates></Point></Placemark>
            <Placemark>
              <Polygon><outerBoundaryIs><LinearRing><coordinates>
                -48.9,-19.6 -48.8,-19.6 -48.8,-19.5 -48.9,-19.5 -48.9,-19.6
              </coordinates></LinearRing></outerBoundaryIs></Polygon>
            </Placemark>
          </Folder>
        </kml>
      `,
    );
    const kmz = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await parser.parse(
      kmz,
      'trevo.kmz',
      'application/vnd.google-earth.kmz',
    );

    expect(result.sourceFormat).toBe('KML');
    expect(result.featureCount).toBe(1);
    expect(result.geometry.type).toBe('MultiPolygon');
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
