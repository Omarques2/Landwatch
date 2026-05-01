import { describe, expect, it } from 'vitest';

import {
  getAttachmentScopeSelectOptions,
  getDefaultAttachmentScope,
} from './view-models';

describe('attachment scope select options', () => {
  it('prefers platform scope and disables org scopes when platform scopes exist', () => {
    const options = getAttachmentScopeSelectOptions(
      ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
      true,
    );

    expect(options).toEqual([
      {
        value: 'PLATFORM_FEATURE',
        label: 'Feição da plataforma',
        disabled: false,
      },
      {
        value: 'PLATFORM_CAR',
        label: 'CAR da plataforma',
        disabled: false,
      },
      {
        value: 'ORG_FEATURE',
        label: 'Feição da organização',
        disabled: true,
      },
      {
        value: 'ORG_CAR',
        label: 'CAR da organização',
        disabled: true,
      },
    ]);
    expect(
      getDefaultAttachmentScope(
        ['ORG_FEATURE', 'ORG_CAR', 'PLATFORM_FEATURE', 'PLATFORM_CAR'],
        true,
      ),
    ).toBe('PLATFORM_FEATURE');
  });

  it('keeps org scopes enabled when platform scopes are unavailable', () => {
    const options = getAttachmentScopeSelectOptions(
      ['ORG_FEATURE', 'ORG_CAR'],
      true,
    );

    expect(options).toEqual([
      {
        value: 'ORG_FEATURE',
        label: 'Feição da organização',
        disabled: false,
      },
      {
        value: 'ORG_CAR',
        label: 'CAR da organização',
        disabled: false,
      },
    ]);
    expect(getDefaultAttachmentScope(['ORG_FEATURE', 'ORG_CAR'], true)).toBe('ORG_FEATURE');
  });
});
