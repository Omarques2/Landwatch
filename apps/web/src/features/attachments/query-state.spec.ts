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
      fromAnalysisId: null,
      carKey: '',
      q: '',
      intersectsCarOnly: false,
    });

    expect(query).toEqual({
      tab: 'explore',
      datasetCode: ['PRODES_2024'],
      featureId: undefined,
      fromAnalysisId: undefined,
      carKey: undefined,
      q: undefined,
      intersectsCarOnly: undefined,
    });
  });
});
