import { describe, expect, it } from 'vitest';
import {
  buildAttachmentsQueryState,
  parseAttachmentsQueryState,
} from './query-state';

describe('attachments query state', () => {
  it('parses repeated datasetCode entries and infers intersectsCarOnly from carKey', () => {
    const state = parseAttachmentsQueryState({
      tab: 'pending',
      datasetCode: ['PRODES_2024', 'UCS_2025'],
      featureId: '42',
      carKey: 'TO-123',
      q: 'rio',
    });

    expect(state).toEqual({
      tab: 'pending',
      datasetCodes: ['PRODES_2024', 'UCS_2025'],
      featureId: '42',
      targets: [],
      fromAnalysisId: null,
      carKey: 'TO-123',
      q: 'rio',
      intersectsCarOnly: true,
    });
  });

  it('builds a minimal query payload without empty values', () => {
    const query = buildAttachmentsQueryState({
      tab: 'explore',
      datasetCodes: ['PRODES_2024'],
      featureId: null,
      targets: [],
      fromAnalysisId: null,
      carKey: '',
      q: '',
      intersectsCarOnly: false,
    });

    expect(query).toEqual({
      tab: 'explore',
      datasetCode: ['PRODES_2024'],
      featureId: undefined,
      target: undefined,
      fromAnalysisId: undefined,
      carKey: undefined,
      q: undefined,
      intersectsCarOnly: undefined,
    });
  });

  it('parses repeated valid targets, removes duplicates and ignores malformed entries', () => {
    const state = parseAttachmentsQueryState({
      tab: 'explore',
      target: [
        'UNIDADES_CONSERVACAO:22857615',
        'PRODES_AMZ_2024:42',
        'UNIDADES_CONSERVACAO:22857615',
        'missing-feature-id:',
        ':missing-dataset',
        'invalid',
      ],
    });

    expect(state.targets).toEqual([
      { datasetCode: 'UNIDADES_CONSERVACAO', featureId: '22857615' },
      { datasetCode: 'PRODES_AMZ_2024', featureId: '42' },
    ]);
  });

  it('serializes multiple targets as repeated query entries', () => {
    const query = buildAttachmentsQueryState({
      tab: 'explore',
      datasetCodes: ['UNIDADES_CONSERVACAO', 'PRODES_AMZ_2024'],
      featureId: null,
      targets: [
        { datasetCode: 'UNIDADES_CONSERVACAO', featureId: '22857615' },
        { datasetCode: 'PRODES_AMZ_2024', featureId: '42' },
      ],
      fromAnalysisId: 'analysis-1',
      carKey: 'MT-123',
      q: '',
      intersectsCarOnly: true,
    });

    expect(query.target).toEqual([
      'UNIDADES_CONSERVACAO:22857615',
      'PRODES_AMZ_2024:42',
    ]);
  });
});
