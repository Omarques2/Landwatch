import {
  buildIndigenaItemKey,
  buildUcsItemKey,
  isIndigenaDataset,
  isLdiDataset,
  isUcsDataset,
} from './analysis-dataset-keys';

describe('analysis-dataset-keys', () => {
  it('builds item keys from attribute values', () => {
    expect(buildIndigenaItemKey('Em Estudo')).toBe('INDIGENAS_EM_ESTUDO');
    expect(buildIndigenaItemKey('  ')).toBe('INDIGENAS_FASE');
    expect(buildUcsItemKey('Área de Proteção Ambiental')).toBe(
      'UCS_AREA_DE_PROTECAO_AMBIENTAL',
    );
  });

  it('classifies dataset families', () => {
    expect(isIndigenaDataset('INDIGENAS', 'TI_FUNAI')).toBe(true);
    expect(isIndigenaDataset('PRODES', 'PRODES_2020')).toBe(false);
    expect(isUcsDataset('UCS_SNIRH', 'X')).toBe(true);
    expect(isUcsDataset(null, 'UNIDADES_CONSERVACAO')).toBe(true);
    expect(isLdiDataset('LDI', 'X')).toBe(true);
    expect(isLdiDataset('SOCIAL', 'LDI_SEMAS_AUTOMATIZADO')).toBe(true);
    expect(isLdiDataset('PRODES', 'PRODES_2020')).toBe(false);
  });
});
