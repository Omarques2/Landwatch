import {
  buildUcsLegendItems,
  buildPrintChipRows,
  buildPdfFilename,
  colorForDataset,
  formatPrintDatasetLabel,
  getAnalysisDatasetLegendKinds,
  getAnalysisDatasetStatusLabel,
  getAnalysisDatasetStatusKind,
} from './analysis-pdf-formatters';

describe('analysis-pdf-formatters', () => {
  it('keeps print label and chip packing compatible with the client PDF', () => {
    expect(formatPrintDatasetLabel('  Prodes Mata Atlantica Nb 2024  ')).toBe(
      'Mata Atlantica Nb 2024',
    );

    const rows = buildPrintChipRows(
      [
        { id: 'a', label: 'Reserva de Fauna' },
        { id: 'b', label: 'Floresta' },
        { id: 'c', label: 'Parque' },
        { id: 'd', label: 'Área de Proteção Ambiental' },
        { id: 'e', label: 'Reserva Extrativista' },
      ],
      (item) => item.label,
    );

    expect(rows).toEqual([
      {
        columns: 5,
        items: [
          { id: 'd', label: 'Área de Proteção Ambiental' },
          { id: 'e', label: 'Reserva Extrativista' },
          { id: 'a', label: 'Reserva de Fauna' },
          { id: 'b', label: 'Floresta' },
          { id: 'c', label: 'Parque' },
        ],
      },
    ]);
  });

  it('keeps dataset colors and status semantics compatible with the client PDF', () => {
    expect(colorForDataset('PRODES_AMAZONIA')).toBe('#558b2f');
    expect(getAnalysisDatasetStatusKind({ hit: false })).toBe('ok');
    expect(getAnalysisDatasetStatusKind({ hit: true })).toBe('hit');
    expect(
      getAnalysisDatasetStatusKind({
        hit: true,
        justificationStatus: 'partial',
      }),
    ).toBe('partial');
    expect(
      getAnalysisDatasetStatusKind({
        hit: true,
        justificationStatus: 'full',
      }),
    ).toBe('justified');
    expect(
      getAnalysisDatasetLegendKinds([
        {
          items: [
            { hit: false },
            { hit: true, justificationStatus: 'full' },
            { hit: true, justificationStatus: 'partial' },
            { hit: true },
          ],
        },
      ]).map(getAnalysisDatasetStatusLabel),
    ).toEqual([
      'Sem interseção',
      'Com justificativa',
      'Parcialmente justificada',
      'Com interseção',
    ]);
  });

  it('builds UCS legend items from feature display name like the client map legend', () => {
    expect(
      buildUcsLegendItems([
        {
          categoryCode: 'UCS',
          datasetCode: 'UNIDADES_CONSERVACAO',
          featureId: '1',
          displayName: 'Parque Nacional Teste',
          naturalId: '1234',
        },
        {
          categoryCode: 'UCS',
          datasetCode: 'UNIDADES_CONSERVACAO',
          featureId: '2',
          displayName: 'Área de Proteção Ambiental Rio Claro',
          naturalId: '9999',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        code: 'UCS_area de protecao ambiental rio claro',
        label: 'Área de Proteção Ambiental Rio Claro',
      }),
      expect.objectContaining({
        code: 'UCS_parque nacional teste',
        label: 'Parque Nacional Teste',
      }),
    ]);
  });

  it('builds a sanitized backend PDF filename matching the client base name', () => {
    expect(
      buildPdfFilename({
        id: 'analysis-1',
        farmName: 'Fazenda DETER / Teste',
        analysisDate: '2026-02-12T00:00:00.000Z',
      }),
    ).toBe('Sigfarm-LandWatch-Fazenda-DETER-Teste-2026-02-12-analysis-1.pdf');
  });
});
