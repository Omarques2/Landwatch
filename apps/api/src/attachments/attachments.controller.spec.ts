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
    const controller = new AttachmentsController(service as any);
    await controller.getDatasets({
      user: { sub: 'sub-1' },
      headers: { 'x-org-id': 'org-1' },
    } as any);
    expect(service.resolveActorFromRequest).toHaveBeenCalledWith(
      'sub-1',
      'org-1',
    );
    expect(service.getDatasets).toHaveBeenCalled();
  });

  it('returns capabilities from service', async () => {
    const service = makeServiceMock();
    const controller = new AttachmentsController(service as any);

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
    const controller = new AttachmentsController(service as any);
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
    const controller = new AttachmentsController(service as any);

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
    const controller = new AttachmentsController(service as any);

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
    const controller = new AttachmentsController(service as any);
    const stream = new PassThrough();
    const destroySpy = jest.spyOn(stream, 'destroy');
    service.getPmtilesArchive.mockResolvedValue({
      statusCode: 200,
      headers: {},
      stream,
    });
    pipelineMock.mockImplementation(
      () => new Promise<void>(() => undefined),
    );

    const req = new EventEmitter() as any;
    req.user = { sub: 'sub-1' };
    req.headers = {};

    const res = new MockResponse();
    void controller.getPmtilesArchive(req, res as any, '11');
    await new Promise((resolve) => setImmediate(resolve));
    res.emit('close');

    expect(destroySpy).toHaveBeenCalled();
  });
});
