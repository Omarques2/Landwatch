import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { BadRequestException } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';

const pipelineMock = jest.fn();

jest.mock('stream/promises', () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
}));

function makeServiceMock() {
  return {
    resolveActorFromRequest: jest.fn().mockResolvedValue({
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    }),
    getCapabilities: jest.fn().mockResolvedValue({
      canUpload: true,
      canReview: false,
      canManageCategories: false,
      canManagePermissions: false,
      canViewAudit: false,
      allowedScopes: ['ORG_FEATURE', 'ORG_CAR'],
    }),
    getDatasets: jest.fn().mockResolvedValue([]),
    getFeatureAttachments: jest.fn().mockResolvedValue({
      summary: { totalAttachments: 0 },
      attachments: [],
    }),
    createAttachment: jest.fn().mockResolvedValue({ id: 'att-1' }),
    getPmtilesArchive: jest.fn(),
    listAnalysisAttachments: jest.fn().mockResolvedValue([{ id: 'att-1' }]),
    downloadAnalysisAttachmentForActor: jest.fn().mockResolvedValue({
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      stream: new PassThrough(),
    }),
  };
}

function makeAccessMock() {
  return {
    requirePlatformAdmin: jest.fn(),
    requirePlatformUser: jest.fn(),
    assertCanReadAnalysis: jest.fn().mockResolvedValue(undefined),
  };
}

class MockResponse extends EventEmitter {
  public readonly headers = new Map<string, string>();
  public destroyed = false;
  public writableEnded = false;
  public headersSent = false;
  public statusCode = 200;

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  status(code: number) {
    this.statusCode = code;
    this.headersSent = true;
    return this;
  }

  end() {
    this.writableEnded = true;
    return this;
  }

  destroy(_error?: Error) {
    this.destroyed = true;
    return this;
  }
}

describe('AttachmentsController', () => {
  beforeEach(() => {
    pipelineMock.mockReset();
  });

  it('returns datasets from service', async () => {
    const service = makeServiceMock();
    const access = makeAccessMock();
    const controller = new AttachmentsController(service as any, access as any);
    await controller.getDatasets({
      user: { sub: 'sub-1' },
      headers: { 'x-org-id': 'org-1' },
    } as any);
    expect(service.resolveActorFromRequest).toHaveBeenCalledWith(
      'sub-1',
      'org-1',
    );
    expect(service.getDatasets).toHaveBeenCalled();
    // The anexos module gate is now platform-USER (members allowed); structural
    // admin ops stay guarded inside the service.
    expect(access.requirePlatformUser).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
    );
  });

  it('returns capabilities from service', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(
      service as any,
      makeAccessMock() as any,
    );

    const result = await controller.getCapabilities({
      user: { sub: 'sub-1' },
      headers: { 'x-org-id': 'org-1' },
    } as any);

    expect(service.resolveActorFromRequest).toHaveBeenCalledWith(
      'sub-1',
      'org-1',
    );
    expect(service.getCapabilities).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        orgId: 'org-1',
      }),
    );
    expect(result).toMatchObject({
      canUpload: true,
      allowedScopes: ['ORG_FEATURE', 'ORG_CAR'],
    });
  });

  it('rejects invalid metadata json on multipart upload', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(
      service as any,
      makeAccessMock() as any,
    );
    await expect(
      controller.createAttachment(
        { user: { sub: 'sub-1' }, headers: {}, ip: '127.0.0.1' } as any,
        {
          buffer: Buffer.from('a'),
          originalname: 'a.pdf',
          mimetype: 'application/pdf',
          size: 1,
        },
        '{bad-json',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts ORG_CAR target metadata without appliesOrgId and forwards to service', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(
      service as any,
      makeAccessMock() as any,
    );

    await controller.createAttachment(
      { user: { sub: 'sub-1' }, headers: {}, ip: '127.0.0.1' } as any,
      {
        buffer: Buffer.from('a'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 1,
      },
      JSON.stringify({
        categoryCode: 'JUSTIFICATIVA_TECNICA',
        visibility: 'PUBLIC',
        targets: [
          {
            datasetCode: 'PRODES_CERRADO_NB_2021',
            featureId: '7426006',
            featureKey: '3796679',
            scope: 'ORG_CAR',
            carKey: 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF',
            validFrom: '2026-04-01',
            validTo: '2026-04-19',
          },
        ],
      }),
    );

    expect(service.createAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        categoryCode: 'JUSTIFICATIVA_TECNICA',
        targets: [
          expect.objectContaining({
            datasetCode: 'PRODES_CERRADO_NB_2021',
            scope: 'ORG_CAR',
            carKey: 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF',
          }),
        ],
      }),
      expect.anything(),
      '127.0.0.1',
    );
  });

  it('forwards optional carKey when listing feature attachments', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(
      service as any,
      makeAccessMock() as any,
    );

    await controller.getFeatureAttachments(
      { user: { sub: 'sub-1' }, headers: { 'x-org-id': 'org-1' } } as any,
      'PRODES_CERRADO_NB_2021',
      '42',
      'CAR-123',
    );

    expect(service.getFeatureAttachments).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'PRODES_CERRADO_NB_2021',
      '42',
      'CAR-123',
    );
  });

  it('destroys PMTiles source stream when response closes', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(
      service as any,
      makeAccessMock() as any,
    );
    const stream = new PassThrough();
    const destroySpy = jest.spyOn(stream, 'destroy');
    service.getPmtilesArchive.mockResolvedValue({
      statusCode: 200,
      headers: {},
      stream,
    });
    pipelineMock.mockImplementation(() => new Promise<void>(() => undefined));

    const req = new EventEmitter() as any;
    req.user = { sub: 'sub-1' };
    req.headers = {};

    const res = new MockResponse();
    void controller.getPmtilesArchive(req, res as any, '11');
    await new Promise((resolve) => setImmediate(resolve));
    res.emit('close');

    expect(destroySpy).toHaveBeenCalled();
  });

  describe('analysis-scoped routes (tenant accessible)', () => {
    it('lists analysis attachments for a tenant without requiring platform admin', async () => {
      const service = makeServiceMock();
      const access = makeAccessMock();
      const controller = new AttachmentsController(
        service as any,
        access as any,
      );

      const result = await controller.listAnalysisAttachments(
        { user: { sub: 'sub-1' }, headers: { 'x-org-id': 'org-1' } } as any,
        'analysis-1',
      );

      expect(access.requirePlatformAdmin).not.toHaveBeenCalled();
      expect(access.assertCanReadAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
        'analysis-1',
      );
      expect(service.listAnalysisAttachments).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
        'analysis-1',
      );
      expect(result).toEqual([{ id: 'att-1' }]);
    });

    it('blocks listing when the analysis is not readable by the actor', async () => {
      const service = makeServiceMock();
      const access = makeAccessMock();
      access.assertCanReadAnalysis.mockRejectedValue(
        new BadRequestException({ code: 'RESOURCE_ORG_FORBIDDEN' }),
      );
      const controller = new AttachmentsController(
        service as any,
        access as any,
      );

      await expect(
        controller.listAnalysisAttachments(
          { user: { sub: 'sub-1' }, headers: { 'x-org-id': 'org-1' } } as any,
          'analysis-other-org',
        ),
      ).rejects.toMatchObject({ response: { code: 'RESOURCE_ORG_FORBIDDEN' } });
      expect(service.listAnalysisAttachments).not.toHaveBeenCalled();
    });

    it('downloads an analysis attachment via the contextual route', async () => {
      const service = makeServiceMock();
      const access = makeAccessMock();
      const controller = new AttachmentsController(
        service as any,
        access as any,
      );
      const res = new MockResponse();

      await controller.downloadAnalysisAttachment(
        {
          user: { sub: 'sub-1' },
          headers: { 'x-org-id': 'org-1' },
          ip: '1.1.1.1',
        } as any,
        'analysis-1',
        'att-1',
        res as any,
      );

      expect(access.requirePlatformAdmin).not.toHaveBeenCalled();
      expect(access.assertCanReadAnalysis).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
        'analysis-1',
      );
      expect(service.downloadAnalysisAttachmentForActor).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
        'analysis-1',
        'att-1',
        '1.1.1.1',
      );
      expect(res.headers.get('Content-Disposition')).toContain('doc.pdf');
    });
  });
});
