import { AttachmentsService } from './attachments.service';
import { BlobServiceClient } from '@azure/storage-blob';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

function makePrismaMock() {
  const tx = {
    attachment: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    attachmentEvent: { create: jest.fn() },
    attachmentTarget: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    analysisAttachmentEffective: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  return {
    user: { findUnique: jest.fn() },
    org: { findUnique: jest.fn() },
    orgMembership: { findUnique: jest.fn(), findMany: jest.fn() },
    orgUserPermission: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    attachmentCategory: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    analysis: { findUnique: jest.fn() },
    analysisAttachmentEffective: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    attachmentTarget: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    attachmentMapFilterSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    attachment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    attachmentEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    analysisPostprocessJob: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(undefined),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (callback: (ctx: typeof tx) => unknown) =>
      callback(tx),
    ),
    __tx: tx,
  };
}

function makeBlobServiceMock(overrides?: {
  uploadData?: jest.Mock;
  download?: jest.Mock;
  downloadToBuffer?: jest.Mock;
}) {
  const uploadData =
    overrides?.uploadData ??
    jest.fn().mockResolvedValue({ etag: '"blob-etag-1"' });
  const download =
    overrides?.download ??
    jest.fn().mockResolvedValue({
      readableStreamBody: Readable.from([Buffer.from('blob-data')]),
    });
  const downloadToBuffer =
    overrides?.downloadToBuffer ??
    jest.fn().mockResolvedValue(Buffer.from('blob-data'));
  const getBlockBlobClient = jest.fn().mockReturnValue({
    uploadData,
    download,
    downloadToBuffer,
  });
  const getBlobClient = jest.fn().mockReturnValue({
    uploadData,
    download,
    downloadToBuffer,
  });
  const getContainerClient = jest.fn().mockReturnValue({
    getBlockBlobClient,
    getBlobClient,
  });
  return {
    client: {
      getContainerClient,
    },
    uploadData,
    download,
    downloadToBuffer,
    getBlockBlobClient,
    getBlobClient,
    getContainerClient,
  };
}

describe('AttachmentsService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.PLATFORM_ADMIN_SUBS;
    delete process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV;
    delete process.env.ATTACHMENTS_MVT_VECTOR_MAX_ZOOM;
    delete process.env.ATTACHMENTS_MVT_MAP_MIN_ZOOM;
    delete process.env.ATTACHMENTS_MVT_MAP_MAX_ZOOM;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_MIN_ZOOM;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_TARGET_ZOOM;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_MAX_VISIBLE_CENTROIDS;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_QUEUE_CAP;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_CONCURRENCY;
    delete process.env.ATTACHMENTS_MVT_PREFETCH_INTERACTION_TILE_RADIUS;
    delete process.env.ATTACHMENTS_MVT_CENTROID_HOLD_MAX_MS;
    delete process.env.ATTACHMENTS_MVT_MAP_LOCK_BOUNDS;
    delete process.env.ATTACHMENTS_MVT_REFRESH_EXPIRED_TILES;
    delete process.env.ATTACHMENTS_MVT_CACHE_MAX_AGE_SECONDS;
    delete process.env.ATTACHMENTS_MVT_DIAGNOSTIC_LOG_ENABLED;
    delete process.env.ATTACHMENTS_MVT_DIAGNOSTIC_LOG_PATH;
    delete process.env.ATTACHMENTS_MVT_CENTROID_SMALL_TILE_AREA;
    delete process.env.ATTACHMENTS_PMTILES_ENABLED;
    delete process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING;
    delete process.env.ATTACHMENTS_PMTILES_BLOB_CONTAINER;
    delete process.env.ATTACHMENTS_PMTILES_BLOB_PREFIX;
    delete process.env.ATTACHMENTS_BLOB_PROVIDER;
    delete process.env.ATTACHMENTS_BLOB_CONTAINER;
    process.env.ATTACHMENTS_MVT_DIAGNOSTIC_LOG_ENABLED = 'false';
    process.env.API_KEY_PEPPER = 'test-pepper';
    process.env.ATTACHMENTS_LOCAL_DIR = `${process.cwd()}/.tmp-test-attachments`;
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(makeBlobServiceMock().client as any);
  });

  it('requires X-Org-Id for non-admin user', async () => {
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'active',
    });
    const service = new AttachmentsService(prisma as any);

    await expect(
      service.resolveActorFromRequest('sub-1', null),
    ).rejects.toMatchObject({
      response: { code: 'ORG_REQUIRED' },
    });
  });

  it('returns reviewer capabilities when ATTACHMENT_REVIEW exists for org user', async () => {
    const orgId = '00000000-0000-4000-8000-000000000001';
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'active',
    });
    prisma.org.findUnique.mockResolvedValue({ id: orgId });
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
    prisma.orgUserPermission.findUnique.mockResolvedValue({ id: 'perm-1' });
    const service = new AttachmentsService(prisma as any);

    const actor = await service.resolveActorFromRequest('sub-1', orgId);
    const capabilities = await service.getCapabilities(actor);

    expect(capabilities).toMatchObject({
      canUpload: true,
      canReview: true,
      canManageCategories: false,
      canManagePermissions: false,
      canViewAudit: false,
      allowedScopes: ['ORG_FEATURE', 'ORG_CAR'],
    });
  });

  it('returns admin capabilities with platform scopes', async () => {
    process.env.PLATFORM_ADMIN_SUBS = 'sub-admin';
    const prisma = makePrismaMock();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'active',
    });
    const service = new AttachmentsService(prisma as any);

    const actor = await service.resolveActorFromRequest('sub-admin', null);
    const capabilities = await service.getCapabilities(actor);

    expect(capabilities).toMatchObject({
      canUpload: true,
      canReview: true,
      canManageCategories: true,
      canManagePermissions: true,
      canViewAudit: true,
      allowedScopes: [
        'ORG_FEATURE',
        'ORG_CAR',
        'PLATFORM_FEATURE',
        'PLATFORM_CAR',
      ],
    });
  });

  it('lets platform admin grant and list attachment reviewers in the active org', async () => {
    const orgId = '00000000-0000-4000-8000-000000000001';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'admin-1',
      orgId,
      isPlatformAdmin: true,
      subject: 'sub-admin',
    };
    prisma.orgMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
    prisma.orgUserPermission.upsert.mockResolvedValue({
      id: 'perm-1',
      orgId,
      userId: 'reviewer-1',
      permission: 'ATTACHMENT_REVIEW',
      createdAt: new Date('2026-04-20T10:00:00Z'),
      user: {
        id: 'reviewer-1',
        email: 'reviewer@landwatch.local',
        displayName: 'Reviewer',
      },
    });
    prisma.orgUserPermission.findMany.mockResolvedValue([
      {
        id: 'perm-1',
        orgId,
        userId: 'reviewer-1',
        permission: 'ATTACHMENT_REVIEW',
        createdAt: new Date('2026-04-20T10:00:00Z'),
        user: {
          id: 'reviewer-1',
          email: 'reviewer@landwatch.local',
          displayName: 'Reviewer',
        },
      },
    ]);

    const granted = await service.addAttachmentReviewer(actor, 'reviewer-1');
    const reviewers = await service.listAttachmentReviewers(actor);

    expect(prisma.orgUserPermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId_userId_permission: {
            orgId,
            userId: 'reviewer-1',
            permission: 'ATTACHMENT_REVIEW',
          },
        },
      }),
    );
    expect(granted.email).toBe('reviewer@landwatch.local');
    expect(reviewers).toEqual([
      expect.objectContaining({
        userId: 'reviewer-1',
        email: 'reviewer@landwatch.local',
      }),
    ]);
  });

  it('lists my attachments with status counts and serialized targets', async () => {
    const orgId = '00000000-0000-4000-8000-000000000001';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId,
      isPlatformAdmin: false,
      subject: 'sub-1',
    };
    prisma.attachment.findMany.mockResolvedValue([
      {
        id: 'att-1',
        categoryId: 'cat-1',
        ownerOrgId: orgId,
        createdByUserId: 'user-1',
        originalFilename: 'justificativa.pdf',
        contentType: 'application/pdf',
        sizeBytes: BigInt(1024),
        sha256: 'sha',
        blobProvider: 'LOCAL',
        blobContainer: 'attachments',
        blobPath: 'a.pdf',
        blobEtag: null,
        visibility: 'PUBLIC',
        status: 'PENDING',
        isDeletedLogical: false,
        deletedAt: null,
        deletedByUserId: null,
        createdAt: new Date('2026-04-20T10:00:00Z'),
        updatedAt: new Date('2026-04-20T10:00:00Z'),
        submittedAt: new Date('2026-04-20T10:00:00Z'),
        revokedAt: null,
        revokedByUserId: null,
        category: {
          id: 'cat-1',
          code: 'JUSTIFICATIVA_TECNICA',
          name: 'Justificativa técnica',
          isJustification: true,
          requiresApproval: true,
        },
        targets: [
          {
            id: 'target-1',
            datasetCode: 'PRODES',
            featureId: BigInt(42),
            featureKey: 'fk-42',
            naturalId: null,
            carKey: null,
            scope: 'ORG_FEATURE',
            appliesOrgId: orgId,
            validFrom: new Date('2026-04-01'),
            validTo: null,
            status: 'PENDING',
            reviewReason: null,
            reviewedAt: null,
            reviewedByUserId: null,
          },
        ],
      },
    ]);
    prisma.attachment.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.listMyAttachments(actor, {
      status: 'ALL',
      limit: 20,
    });

    expect(result.items[0]).toMatchObject({
      id: 'att-1',
      sizeBytes: '1024',
      targets: [expect.objectContaining({ featureId: '42' })],
    });
    expect(result.counts).toMatchObject({
      all: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      revoked: 0,
      expired: 0,
    });
  });

  it('lists pending targets only for reviewers', async () => {
    const orgId = '00000000-0000-4000-8000-000000000001';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'reviewer-1',
      orgId,
      isPlatformAdmin: false,
      subject: 'sub-reviewer',
    };
    prisma.orgUserPermission.findUnique.mockResolvedValue({ id: 'perm-1' });
    prisma.attachmentTarget.findMany.mockResolvedValue([
      {
        id: 'target-1',
        datasetCode: 'PRODES',
        featureId: BigInt(42),
        featureKey: 'fk-42',
        naturalId: null,
        carKey: 'CAR-1',
        scope: 'ORG_CAR',
        appliesOrgId: orgId,
        validFrom: new Date('2026-04-01'),
        validTo: null,
        status: 'PENDING',
        reviewReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        createdAt: new Date('2026-04-20T10:00:00Z'),
        attachment: {
          id: 'att-1',
          originalFilename: 'pendente.pdf',
          contentType: 'application/pdf',
          sizeBytes: BigInt(10),
          status: 'PENDING',
          visibility: 'PUBLIC',
          createdAt: new Date('2026-04-20T10:00:00Z'),
          createdByUser: {
            id: 'user-1',
            email: 'upload@landwatch.local',
            displayName: 'Uploader',
          },
          category: {
            id: 'cat-1',
            code: 'JUSTIFICATIVA_TECNICA',
            name: 'Justificativa técnica',
            isJustification: true,
            requiresApproval: true,
          },
        },
      },
    ]);

    const result = await service.listPendingAttachmentTargets(actor, {
      limit: 20,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        targetId: 'target-1',
        attachmentId: 'att-1',
        datasetCode: 'PRODES',
        featureId: '42',
        uploaderEmail: 'upload@landwatch.local',
      }),
    ]);
  });

  it('lists global attachment events only for platform admins', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'admin-1',
      orgId: null,
      isPlatformAdmin: true,
      subject: 'sub-admin',
    };
    prisma.attachmentEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        attachmentId: 'att-1',
        attachmentTargetId: null,
        actorUserId: 'user-1',
        actorOrgId: null,
        actorIp: '127.0.0.1',
        eventType: 'CREATED',
        payload: { categoryCode: 'DOCUMENTO' },
        createdAt: new Date('2026-04-20T10:00:00Z'),
        actorUser: {
          id: 'user-1',
          email: 'user@landwatch.local',
          displayName: 'User',
        },
        attachment: {
          id: 'att-1',
          originalFilename: 'arquivo.pdf',
          category: { code: 'DOCUMENTO', name: 'Documento' },
        },
      },
    ]);

    const result = await service.listAttachmentEvents(actor, { limit: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'event-1',
        actorEmail: 'user@landwatch.local',
        originalFilename: 'arquivo.pdf',
        payloadJson: { categoryCode: 'DOCUMENTO' },
      }),
    ]);
  });

  it('lists feature attachments filtered by org scope and optional carKey', async () => {
    const prisma = makePrismaMock();
    const orgId = '00000000-0000-4000-8000-000000000001';
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId,
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    prisma.$queryRaw.mockResolvedValue([
      {
        dataset_code: 'PRODES_CERRADO_NB_2021',
        category_code: 'PRODES',
        feature_id: '42',
        feature_key: 'fk-42',
        natural_id: 'nat-42',
        display_name: 'Feicao 42',
        geom: '{"type":"Polygon","coordinates":[]}',
        attrs: { classe: 'abc' },
      },
    ]);
    prisma.attachmentTarget.findMany.mockResolvedValue([
      {
        id: 'target-org-feature',
        datasetCode: 'PRODES_CERRADO_NB_2021',
        featureId: BigInt(42),
        featureKey: 'fk-42',
        naturalId: 'nat-42',
        carKey: null,
        scope: 'ORG_FEATURE',
        appliesOrgId: orgId,
        validFrom: new Date('2026-01-01'),
        validTo: null,
        status: 'APPROVED',
        reviewReason: null,
        reviewedAt: new Date('2026-01-02'),
        reviewedByUserId: 'reviewer-1',
        attachment: {
          id: 'att-org-feature',
          categoryId: 'cat-1',
          ownerOrgId: orgId,
          createdByUserId: 'user-1',
          originalFilename: 'org-feature.pdf',
          contentType: 'application/pdf',
          sizeBytes: BigInt(10),
          sha256: 'hash-1',
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments',
          blobPath: 'a.pdf',
          blobEtag: null,
          visibility: 'PUBLIC',
          status: 'APPROVED',
          isDeletedLogical: false,
          deletedAt: null,
          deletedByUserId: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
          submittedAt: new Date('2026-01-01T10:00:00Z'),
          revokedAt: null,
          revokedByUserId: null,
          category: {
            id: 'cat-1',
            code: 'JUSTIFICATIVA_TECNICA',
            name: 'Justificativa técnica',
            isJustification: true,
            requiresApproval: true,
          },
        },
      },
      {
        id: 'target-org-car-match',
        datasetCode: 'PRODES_CERRADO_NB_2021',
        featureId: BigInt(42),
        featureKey: 'fk-42',
        naturalId: 'nat-42',
        carKey: 'CAR-123',
        scope: 'ORG_CAR',
        appliesOrgId: orgId,
        validFrom: new Date('2026-01-01'),
        validTo: null,
        status: 'PENDING',
        reviewReason: null,
        reviewedAt: null,
        reviewedByUserId: null,
        attachment: {
          id: 'att-org-car',
          categoryId: 'cat-1',
          ownerOrgId: orgId,
          createdByUserId: 'user-1',
          originalFilename: 'org-car.pdf',
          contentType: 'application/pdf',
          sizeBytes: BigInt(11),
          sha256: 'hash-2',
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments',
          blobPath: 'b.pdf',
          blobEtag: null,
          visibility: 'PUBLIC',
          status: 'PENDING',
          isDeletedLogical: false,
          deletedAt: null,
          deletedByUserId: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
          submittedAt: new Date('2026-01-01T10:00:00Z'),
          revokedAt: null,
          revokedByUserId: null,
          category: {
            id: 'cat-1',
            code: 'JUSTIFICATIVA_TECNICA',
            name: 'Justificativa técnica',
            isJustification: true,
            requiresApproval: true,
          },
        },
      },
      {
        id: 'target-platform',
        datasetCode: 'PRODES_CERRADO_NB_2021',
        featureId: BigInt(42),
        featureKey: 'fk-42',
        naturalId: 'nat-42',
        carKey: null,
        scope: 'PLATFORM_FEATURE',
        appliesOrgId: null,
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-02-01'),
        status: 'APPROVED',
        reviewReason: null,
        reviewedAt: new Date('2026-01-02'),
        reviewedByUserId: 'reviewer-1',
        attachment: {
          id: 'att-platform',
          categoryId: 'cat-2',
          ownerOrgId: null,
          createdByUserId: 'user-2',
          originalFilename: 'platform.png',
          contentType: 'image/png',
          sizeBytes: BigInt(12),
          sha256: 'hash-3',
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments',
          blobPath: 'c.png',
          blobEtag: null,
          visibility: 'PRIVATE',
          status: 'APPROVED',
          isDeletedLogical: false,
          deletedAt: null,
          deletedByUserId: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
          submittedAt: new Date('2026-01-01T10:00:00Z'),
          revokedAt: null,
          revokedByUserId: null,
          category: {
            id: 'cat-2',
            code: 'DOCUMENTO_INFORMATIVO',
            name: 'Documento informativo',
            isJustification: false,
            requiresApproval: false,
          },
        },
      },
      {
        id: 'target-other-org',
        datasetCode: 'PRODES_CERRADO_NB_2021',
        featureId: BigInt(42),
        featureKey: 'fk-42',
        naturalId: 'nat-42',
        carKey: null,
        scope: 'ORG_FEATURE',
        appliesOrgId: '00000000-0000-4000-8000-000000000099',
        validFrom: new Date('2026-01-01'),
        validTo: null,
        status: 'APPROVED',
        reviewReason: null,
        reviewedAt: new Date('2026-01-02'),
        reviewedByUserId: 'reviewer-1',
        attachment: {
          id: 'att-other-org',
          categoryId: 'cat-1',
          ownerOrgId: '00000000-0000-4000-8000-000000000099',
          createdByUserId: 'user-9',
          originalFilename: 'other-org.pdf',
          contentType: 'application/pdf',
          sizeBytes: BigInt(13),
          sha256: 'hash-4',
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments',
          blobPath: 'd.pdf',
          blobEtag: null,
          visibility: 'PUBLIC',
          status: 'APPROVED',
          isDeletedLogical: false,
          deletedAt: null,
          deletedByUserId: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
          submittedAt: new Date('2026-01-01T10:00:00Z'),
          revokedAt: null,
          revokedByUserId: null,
          category: {
            id: 'cat-1',
            code: 'JUSTIFICATIVA_TECNICA',
            name: 'Justificativa técnica',
            isJustification: true,
            requiresApproval: true,
          },
        },
      },
    ]);

    const withoutCar = await service.getFeatureAttachments(
      actor,
      'PRODES_CERRADO_NB_2021',
      '42',
      null,
    );
    expect(withoutCar.summary).toMatchObject({
      totalAttachments: 2,
      approvedCount: 2,
      pendingCount: 0,
      informativeCount: 1,
      justificationCount: 1,
      expiredCount: 1,
    });
    expect(withoutCar.attachments.map((item) => item.id)).toEqual([
      'att-org-feature',
      'att-platform',
    ]);

    const withCar = await service.getFeatureAttachments(
      actor,
      'PRODES_CERRADO_NB_2021',
      '42',
      'CAR-123',
    );
    expect(withCar.summary).toMatchObject({
      totalAttachments: 3,
      approvedCount: 2,
      pendingCount: 1,
      informativeCount: 1,
      justificationCount: 2,
      expiredCount: 1,
    });
    expect(withCar.attachments.map((item) => item.id)).toEqual([
      'att-org-feature',
      'att-org-car',
      'att-platform',
    ]);
  });

  it('forces justification categories to require approval and public default', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: null,
      isPlatformAdmin: true,
      subject: 'sub-1',
    };

    prisma.attachmentCategory.create.mockResolvedValue({
      id: 'cat-1',
      code: 'JUSTIFICATIVA',
      isJustification: true,
      requiresApproval: true,
      isPublicDefault: true,
    });

    await service.createCategory(actor, {
      code: 'justificativa',
      name: 'Justificativa',
      isJustification: true,
      requiresApproval: false,
      isPublicDefault: false,
    });

    expect(prisma.attachmentCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'JUSTIFICATIVA',
          isJustification: true,
          requiresApproval: true,
          isPublicDefault: true,
        }),
      }),
    );
  });

  it('lists public analysis attachments without a public token', async () => {
    const prisma = makePrismaMock();
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'MT-123',
      orgId: 'org-1',
      analysisDate: new Date('2026-04-16'),
    });
    prisma.analysisAttachmentEffective.findMany.mockResolvedValue([
      {
        attachment: {
          id: 'att-1',
          originalFilename: 'justificativa.pdf',
          contentType: 'application/pdf',
          sizeBytes: BigInt(120),
          category: {
            code: 'JUSTIFICATIVA_TECNICA',
            name: 'Justificativa técnica',
          },
        },
        capturedIsJustification: true,
      },
    ]);

    const service = new AttachmentsService(prisma as any);
    await expect(
      service.listPublicAnalysisAttachments('analysis-1', '127.0.0.1'),
    ).resolves.toEqual([
      {
        id: 'att-1',
        categoryCode: 'JUSTIFICATIVA_TECNICA',
        categoryName: 'Justificativa técnica',
        isJustification: true,
        originalFilename: 'justificativa.pdf',
        contentType: 'application/pdf',
        sizeBytes: '120',
      },
    ]);
  });

  it('streams private attachment download from Azure Blob', async () => {
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    const blobMock = makeBlobServiceMock({
      download: jest.fn().mockResolvedValue({
        readableStreamBody: Readable.from([Buffer.from('blob-download')]),
      }),
    });
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(blobMock.client as any);
    const service = new AttachmentsService(prisma as any);
    jest.spyOn(service as any, 'ensureCanAccessAttachment').mockResolvedValue({
      id: 'att-1',
      originalFilename: 'arquivo.pdf',
      contentType: 'application/pdf',
      blobProvider: 'AZURE_BLOB',
      blobContainer: 'attachments',
      blobPath: '2026/04/arquivo.pdf',
    });

    const result = await service.downloadAttachment(
      {
        userId: 'user-1',
        orgId: 'org-1',
        isPlatformAdmin: false,
        subject: 'sub-1',
      },
      'att-1',
      '127.0.0.1',
    );

    expect(result.filename).toBe('arquivo.pdf');
    expect(result.stream).toBeInstanceOf(Readable);
    expect(blobMock.download).toHaveBeenCalled();
  });

  it('keeps legacy local attachment download working', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const legacyPath = path.join(
      process.env.ATTACHMENTS_LOCAL_DIR!,
      '2026',
      '04',
      'arquivo.pdf',
    );
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, Buffer.from('legacy-local'));
    jest.spyOn(service as any, 'ensureCanAccessAttachment').mockResolvedValue({
      id: 'att-legacy',
      originalFilename: 'arquivo.pdf',
      contentType: 'application/pdf',
      blobProvider: 'LOCAL',
      blobContainer: 'attachments',
      blobPath: '2026/04/arquivo.pdf',
    });

    const result = await service.downloadAttachment(
      {
        userId: 'user-1',
        orgId: 'org-1',
        isPlatformAdmin: false,
        subject: 'sub-1',
      },
      'att-legacy',
      '127.0.0.1',
    );

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('legacy-local');
  });

  it('builds private analysis zip from Azure Blob attachments', async () => {
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.analysisAttachmentEffective.findMany.mockResolvedValue([
      {
        attachmentId: 'att-1',
        attachment: {
          id: 'att-1',
          originalFilename: 'arquivo.pdf',
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments',
          blobPath: '2026/04/arquivo.pdf',
        },
      },
    ]);
    const blobMock = makeBlobServiceMock({
      downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('zip-blob')),
    });
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(blobMock.client as any);
    const service = new AttachmentsService(prisma as any);

    const result = await service.downloadAnalysisZip(
      {
        userId: 'user-1',
        orgId: 'org-1',
        isPlatformAdmin: false,
        subject: 'sub-1',
      },
      'analysis-1',
      '127.0.0.1',
    );

    expect(result.contentType).toBe('application/zip');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(blobMock.downloadToBuffer).toHaveBeenCalled();
  });

  it('streams public attachment download from Azure Blob and builds public zip', async () => {
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    const snapshot = {
      attachmentId: 'att-1',
      attachment: {
        id: 'att-1',
        originalFilename: 'publico.pdf',
        contentType: 'application/pdf',
        blobProvider: 'AZURE_BLOB',
        blobContainer: 'attachments',
        blobPath: '2026/04/publico.pdf',
      },
    };
    prisma.analysis.findUnique.mockResolvedValue({
      id: 'analysis-1',
      carKey: 'MT-123',
      orgId: 'org-1',
      analysisDate: new Date('2026-04-16'),
    });
    prisma.analysisAttachmentEffective.findFirst.mockResolvedValue(snapshot);
    prisma.analysisAttachmentEffective.findMany.mockResolvedValue([snapshot]);
    const blobMock = makeBlobServiceMock({
      download: jest.fn().mockResolvedValue({
        readableStreamBody: Readable.from([Buffer.from('public-download')]),
      }),
      downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('public-zip')),
    });
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(blobMock.client as any);
    const service = new AttachmentsService(prisma as any);

    const download = await service.downloadPublicAnalysisAttachment(
      'analysis-1',
      'att-1',
      '127.0.0.1',
    );
    const zip = await service.downloadPublicAnalysisZip(
      'analysis-1',
      '127.0.0.1',
    );

    expect(download.filename).toBe('publico.pdf');
    expect(download.stream).toBeInstanceOf(Readable);
    expect(zip.buffer.length).toBeGreaterThan(0);
    expect(blobMock.download).toHaveBeenCalled();
    expect(blobMock.downloadToBuffer).toHaveBeenCalled();
  });

  it('rejects unsupported upload mime type', async () => {
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'DOCUMENTO_INFORMATIVO',
      isJustification: false,
      requiresApproval: false,
      isPublicDefault: true,
    });
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await expect(
      service.createAttachment(
        actor,
        {
          categoryCode: 'DOCUMENTO_INFORMATIVO',
          visibility: 'PUBLIC',
          targets: [
            {
              datasetCode: 'UNIDADES_CONSERVACAO',
              featureId: '1',
              scope: 'ORG_FEATURE',
              validFrom: '2026-04-16',
            },
          ],
        },
        {
          buffer: Buffer.from('test'),
          originalname: 'script.sh',
          mimetype: 'application/x-sh',
          size: 4,
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'UNSUPPORTED_FILE_TYPE' },
    });
  });

  it('uploads new attachments to Azure Blob and persists blob metadata', async () => {
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.ATTACHMENTS_BLOB_CONTAINER = 'attachments-test';
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'DOCUMENTO_INFORMATIVO',
      name: 'Documento informativo',
      isJustification: false,
      requiresApproval: false,
      isPublicDefault: true,
    });
    prisma.__tx.attachment.create.mockResolvedValue({
      id: 'att-1',
      status: 'PENDING',
    });
    prisma.__tx.attachmentTarget.create.mockResolvedValue({
      id: 'target-1',
      datasetCode: 'UNIDADES_CONSERVACAO',
      scope: 'ORG_FEATURE',
      carKey: null,
      status: 'APPROVED',
    });
    prisma.__tx.attachmentTarget.findMany.mockResolvedValue([
      { status: 'APPROVED' },
    ]);
    prisma.__tx.attachment.update.mockResolvedValue({ id: 'att-1' });
    prisma.__tx.attachment.findUniqueOrThrow.mockResolvedValue({
      id: 'att-1',
      categoryId: 'cat-1',
      ownerOrgId: 'org-1',
      createdByUserId: 'user-1',
      originalFilename: 'arquivo.pdf',
      contentType: 'application/pdf',
      sizeBytes: BigInt(3),
      sha256: 'sha',
      blobProvider: 'AZURE_BLOB',
      blobContainer: 'attachments-test',
      blobPath: '2026/04/file.pdf',
      blobEtag: '"blob-etag-1"',
      visibility: 'PUBLIC',
      status: 'APPROVED',
      revokedAt: null,
      revokedByUserId: null,
      isDeletedLogical: false,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
      updatedAt: new Date('2026-04-19T00:00:00.000Z'),
      category: {
        id: 'cat-1',
        code: 'DOCUMENTO_INFORMATIVO',
        name: 'Documento informativo',
      },
      targets: [
        {
          id: 'target-1',
          attachmentId: 'att-1',
          datasetCode: 'UNIDADES_CONSERVACAO',
          featureId: BigInt(1),
          featureKey: null,
          naturalId: null,
          carKey: null,
          scope: 'ORG_FEATURE',
          appliesOrgId: 'org-1',
          validFrom: new Date('2026-04-16T00:00:00.000Z'),
          validTo: null,
          status: 'APPROVED',
          reviewedByUserId: 'user-1',
          reviewedAt: new Date('2026-04-19T00:00:00.000Z'),
          reviewReason: null,
          createdByUserId: 'user-1',
          createdAt: new Date('2026-04-19T00:00:00.000Z'),
          updatedAt: new Date('2026-04-19T00:00:00.000Z'),
        },
      ],
    });

    const blobMock = makeBlobServiceMock();
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(blobMock.client as any);

    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await service.createAttachment(
      actor,
      {
        categoryCode: 'DOCUMENTO_INFORMATIVO',
        visibility: 'PUBLIC',
        targets: [
          {
            datasetCode: 'UNIDADES_CONSERVACAO',
            featureId: '1',
            scope: 'ORG_FEATURE',
            validFrom: '2026-04-16',
          },
        ],
      },
      {
        buffer: Buffer.from('pdf'),
        originalname: 'arquivo.pdf',
        mimetype: 'application/pdf',
        size: 3,
      },
      '127.0.0.1',
    );

    expect(blobMock.getContainerClient).toHaveBeenCalledWith('attachments-test');
    expect(blobMock.uploadData).toHaveBeenCalledWith(
      Buffer.from('pdf'),
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      }),
    );
    expect(prisma.__tx.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blobProvider: 'AZURE_BLOB',
          blobContainer: 'attachments-test',
          blobPath: expect.stringMatching(/^20\d{2}\/\d{2}\/.+\.pdf$/),
          blobEtag: '"blob-etag-1"',
        }),
      }),
    );
  });

  it('fails attachment upload when Azure Blob connection string is missing', async () => {
    delete process.env.ATTACHMENTS_BLOB_CONNECTION_STRING;
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'DOCUMENTO_INFORMATIVO',
      isJustification: false,
      requiresApproval: false,
      isPublicDefault: true,
    });
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await expect(
      service.createAttachment(
        actor,
        {
          categoryCode: 'DOCUMENTO_INFORMATIVO',
          visibility: 'PUBLIC',
          targets: [
            {
              datasetCode: 'UNIDADES_CONSERVACAO',
              featureId: '1',
              scope: 'ORG_FEATURE',
              validFrom: '2026-04-16',
            },
          ],
        },
        {
          buffer: Buffer.from('pdf'),
          originalname: 'arquivo.pdf',
          mimetype: 'application/pdf',
          size: 3,
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BLOB_NOT_CONFIGURED' },
    });
    expect(prisma.__tx.attachment.create).not.toHaveBeenCalled();
  });

  it('does not create attachment row when Azure Blob upload fails', async () => {
    process.env.ATTACHMENTS_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'DOCUMENTO_INFORMATIVO',
      isJustification: false,
      requiresApproval: false,
      isPublicDefault: true,
    });
    const blobMock = makeBlobServiceMock({
      uploadData: jest.fn().mockRejectedValue(new Error('boom')),
    });
    jest
      .spyOn(BlobServiceClient, 'fromConnectionString')
      .mockReturnValue(blobMock.client as any);
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await expect(
      service.createAttachment(
        actor,
        {
          categoryCode: 'DOCUMENTO_INFORMATIVO',
          visibility: 'PUBLIC',
          targets: [
            {
              datasetCode: 'UNIDADES_CONSERVACAO',
              featureId: '1',
              scope: 'ORG_FEATURE',
              validFrom: '2026-04-16',
            },
          ],
        },
        {
          buffer: Buffer.from('pdf'),
          originalname: 'arquivo.pdf',
          mimetype: 'application/pdf',
          size: 3,
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BLOB_UPLOAD_FAILED' },
    });
    expect(prisma.__tx.attachment.create).not.toHaveBeenCalled();
  });

  it('rejects attachment uploads with more than 20 targets before persisting files', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await expect(
      service.createAttachment(
        actor,
        {
          categoryCode: 'DOCUMENTO_INFORMATIVO',
          visibility: 'PUBLIC',
          targets: Array.from({ length: 21 }, (_, index) => ({
            datasetCode: 'UNIDADES_CONSERVACAO',
            featureId: String(index + 1),
            scope: 'ORG_FEATURE',
            validFrom: '2026-04-16',
          })),
        },
        {
          buffer: Buffer.from('pdf'),
          originalname: 'arquivo.pdf',
          mimetype: 'application/pdf',
          size: 3,
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'ATTACHMENT_TARGET_LIMIT_EXCEEDED' },
    });
    expect(prisma.attachmentCategory.findFirst).not.toHaveBeenCalled();
  });

  it('rejects adding targets when the final attachment target count would exceed 20', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };
    prisma.attachment.findUnique.mockResolvedValue({
      id: 'att-1',
      createdByUserId: 'user-1',
      ownerOrgId: 'org-1',
      category: { requiresApproval: true },
      targets: Array.from({ length: 19 }, (_, index) => ({
        id: `target-${index}`,
        appliesOrgId: 'org-1',
        scope: 'ORG_FEATURE',
      })),
    });

    await expect(
      service.addTargets(
        actor,
        'att-1',
        {
          targets: [
            {
              datasetCode: 'UNIDADES_CONSERVACAO',
              featureId: '20',
              scope: 'ORG_FEATURE',
              validFrom: '2026-04-16',
            },
            {
              datasetCode: 'UNIDADES_CONSERVACAO',
              featureId: '21',
              scope: 'ORG_FEATURE',
              validFrom: '2026-04-16',
            },
          ],
        },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'ATTACHMENT_TARGET_LIMIT_EXCEEDED' },
    });
  });

  it('returns filtered target candidates with overflow detection', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        dataset_id: 1,
        dataset_code: 'UNIDADES_CONSERVACAO',
        category_code: 'UCS',
        feature_id: BigInt(index + 1),
        feature_key: `key-${index + 1}`,
        natural_id: null,
        display_name: `Feature ${index + 1}`,
        geom: null,
      })),
    );

    const result = await service.selectFilteredAttachmentTargets({
      datasetCodes: ['UNIDADES_CONSERVACAO'],
      pageSize: 100,
    });

    expect(result.limit).toBe(20);
    expect(result.totalExceeded).toBe(true);
    expect(result.rows).toHaveLength(20);
  });

  it('does not enqueue retroactive recapture when a target is approved', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'reviewer-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };
    prisma.orgUserPermission.findUnique.mockResolvedValue({ id: 'perm-1' });
    prisma.attachmentTarget.findFirst.mockResolvedValue({
      id: 'target-1',
      attachmentId: 'att-1',
    });
    prisma.__tx.attachmentTarget.update.mockResolvedValue({
      id: 'target-1',
      attachmentId: 'att-1',
      status: 'APPROVED',
    });
    jest
      .spyOn(service as any, 'refreshAttachmentStatus')
      .mockResolvedValue('APPROVED');

    await service.approveTarget(
      actor,
      'att-1',
      'target-1',
      'ok',
      '127.0.0.1',
    );

    expect(prisma.analysisPostprocessJob.create).not.toHaveBeenCalled();
  });

  it('does not enqueue retroactive recapture when an attachment is revoked', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'reviewer-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };
    prisma.orgUserPermission.findUnique.mockResolvedValue({ id: 'perm-1' });
    prisma.__tx.attachment.update.mockResolvedValue({
      id: 'att-1',
      status: 'REVOKED',
    });
    jest
      .spyOn(service as any, 'ensureCanAccessAttachment')
      .mockResolvedValue({ id: 'att-1' });

    await service.revokeAttachment(actor, 'att-1', '127.0.0.1');

    expect(prisma.analysisPostprocessJob.create).not.toHaveBeenCalled();
  });

  it('captures effective snapshot rows with cutoff-aware data inside a transaction', async () => {
    const prisma = makePrismaMock();
    prisma.__tx.$queryRaw.mockResolvedValue([
      {
        attachment_id: 'att-1',
        attachment_target_id: 'target-1',
        dataset_code: 'PRODES_AMZ_2024',
        feature_id: '42',
        feature_key: 'feat-42',
        natural_id: 'nat-42',
        car_key: 'CAR-1',
        captured_scope: 'PLATFORM_FEATURE',
        captured_applies_org_id: null,
        captured_visibility: 'PUBLIC',
        captured_target_status: 'APPROVED',
        captured_valid_from: new Date('2026-01-01T00:00:00.000Z'),
        captured_valid_to: null,
        captured_is_justification: true,
      },
    ]);
    const service = new AttachmentsService(prisma as any);

    const inserted = await service.captureEffectiveSnapshotForAnalysisTx(
      prisma.__tx as any,
      {
        analysisId: 'analysis-1',
        carKey: 'CAR-1',
        orgId: 'org-1',
        analysisDate: '2026-01-31',
        cutoffAt: new Date('2026-01-31T10:00:00.000Z'),
        capturedAt: new Date('2026-01-31T10:00:00.000Z'),
      },
    );

    expect(inserted).toBe(1);
    expect(prisma.__tx.analysisAttachmentEffective.deleteMany).toHaveBeenCalledWith(
      { where: { analysisId: 'analysis-1' } },
    );
    expect(prisma.__tx.analysisAttachmentEffective.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            analysisId: 'analysis-1',
            attachmentId: 'att-1',
            attachmentTargetId: 'target-1',
            datasetCode: 'PRODES_AMZ_2024',
            featureId: 42n,
            capturedIsJustification: true,
          }),
        ],
      }),
    );
    const sqlArg = prisma.__tx.$queryRaw.mock.calls[0]?.[0] as { sql?: string };
    expect(sqlArg?.sql ?? '').toContain('"app"."analysis_result"');
    expect(sqlArg?.sql ?? '').toContain('t.created_at <=');
    expect(sqlArg?.sql ?? '').toContain('t.reviewed_at <=');
    expect(sqlArg?.sql ?? '').toContain('a.revoked_at IS NULL OR a.revoked_at >');
  });

  it('auto-approves targets when category does not require approval', async () => {
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'DOCUMENTO_INFORMATIVO',
      isJustification: false,
      requiresApproval: false,
      isPublicDefault: true,
    });
    prisma.__tx.attachment.create.mockResolvedValue({
      id: 'att-1',
      status: 'PENDING',
    });
    prisma.__tx.attachmentTarget.create.mockResolvedValue({
      id: 'target-1',
      datasetCode: 'UNIDADES_CONSERVACAO',
      scope: 'ORG_FEATURE',
      carKey: null,
      status: 'APPROVED',
    });
    prisma.__tx.attachmentTarget.findMany.mockResolvedValue([
      { status: 'APPROVED' },
    ]);
    prisma.__tx.attachment.update.mockResolvedValue({ id: 'att-1' });
    prisma.__tx.attachment.findUniqueOrThrow.mockResolvedValue({
      id: 'att-1',
      status: 'APPROVED',
      category: { id: 'cat-1', code: 'DOCUMENTO_INFORMATIVO' },
      targets: [{ id: 'target-1', status: 'APPROVED' }],
    });

    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await service.createAttachment(
      actor,
      {
        categoryCode: 'DOCUMENTO_INFORMATIVO',
        visibility: 'PUBLIC',
        targets: [
          {
            datasetCode: 'UNIDADES_CONSERVACAO',
            featureId: '1',
            scope: 'ORG_FEATURE',
            validFrom: '2026-04-16',
          },
        ],
      },
      {
        buffer: Buffer.from('pdf'),
        originalname: 'arquivo.pdf',
        mimetype: 'application/pdf',
        size: 3,
      },
      '127.0.0.1',
    );

    expect(prisma.__tx.attachmentTarget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('serializes BigInt fields in createAttachment response', async () => {
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'JUSTIFICATIVA_TECNICA',
      name: 'Justificativa Tecnica',
      isJustification: true,
      requiresApproval: true,
      isPublicDefault: true,
    });
    prisma.__tx.attachment.create.mockResolvedValue({
      id: 'att-1',
      status: 'PENDING',
    });
    prisma.__tx.attachmentTarget.create.mockResolvedValue({
      id: 'target-1',
      datasetCode: 'PRODES_CERRADO_NB_2021',
      scope: 'PLATFORM_CAR',
      carKey: 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF',
      status: 'PENDING',
    });
    prisma.__tx.attachmentTarget.findMany.mockResolvedValue([
      { status: 'PENDING' },
    ]);
    prisma.__tx.attachment.update.mockResolvedValue({ id: 'att-1' });
    prisma.__tx.attachment.findUniqueOrThrow.mockResolvedValue({
      id: 'att-1',
      categoryId: 'cat-1',
      ownerOrgId: null,
      createdByUserId: 'user-1',
      originalFilename: 'LandWatchTeste.pdf',
      contentType: 'application/pdf',
      sizeBytes: BigInt(123),
      sha256: 'sha',
      blobProvider: 'local',
      blobContainer: 'attachments',
      blobPath: '2026/04/file.pdf',
      blobEtag: null,
      visibility: 'PUBLIC',
      status: 'PENDING',
      revokedAt: null,
      revokedByUserId: null,
      isDeletedLogical: false,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
      updatedAt: new Date('2026-04-19T00:00:00.000Z'),
      category: {
        id: 'cat-1',
        code: 'JUSTIFICATIVA_TECNICA',
        name: 'Justificativa Tecnica',
      },
      targets: [
        {
          id: 'target-1',
          attachmentId: 'att-1',
          datasetCode: 'PRODES_CERRADO_NB_2021',
          featureId: BigInt(7426006),
          featureKey: '3796679',
          naturalId: null,
          carKey: 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF',
          scope: 'PLATFORM_CAR',
          appliesOrgId: null,
          validFrom: new Date('2026-04-01T00:00:00.000Z'),
          validTo: new Date('2026-04-19T00:00:00.000Z'),
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewReason: null,
          createdByUserId: 'user-1',
          createdAt: new Date('2026-04-19T00:00:00.000Z'),
          updatedAt: new Date('2026-04-19T00:00:00.000Z'),
        },
      ],
    });

    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: null,
      isPlatformAdmin: true,
      subject: 'sub-1',
    };

    const result = await service.createAttachment(
      actor,
      {
        categoryCode: 'JUSTIFICATIVA_TECNICA',
        visibility: 'PUBLIC',
        targets: [
          {
            datasetCode: 'PRODES_CERRADO_NB_2021',
            featureId: '7426006',
            featureKey: '3796679',
            scope: 'PLATFORM_CAR',
            carKey: 'TO-1701002-A0FCE32AB8284F5FB5B8C7905E9658BF',
            validFrom: '2026-04-01',
            validTo: '2026-04-19',
          },
        ],
      },
      {
        buffer: Buffer.from('pdf'),
        originalname: 'LandWatchTeste.pdf',
        mimetype: 'application/pdf',
        size: 3,
      },
      '127.0.0.1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'att-1',
        sizeBytes: '123',
        targets: [
          expect.objectContaining({
            id: 'target-1',
            featureId: '7426006',
          }),
        ],
      }),
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('auto-approves justification targets created by platform admin', async () => {
    const prisma = makePrismaMock();
    prisma.attachmentCategory.findFirst.mockResolvedValue({
      id: 'cat-1',
      code: 'JUSTIFICATIVA_TECNICA',
      isJustification: true,
      requiresApproval: true,
      isPublicDefault: true,
    });
    prisma.__tx.attachment.create.mockResolvedValue({
      id: 'att-1',
      status: 'PENDING',
    });
    prisma.__tx.attachmentTarget.create.mockResolvedValue({
      id: 'target-1',
      datasetCode: 'PRODES_CERRADO_NB_2021',
      scope: 'PLATFORM_CAR',
      carKey: 'CAR-1',
      status: 'APPROVED',
      reviewedByUserId: 'user-1',
    });
    prisma.__tx.attachmentTarget.findMany.mockResolvedValue([
      { status: 'APPROVED' },
    ]);
    prisma.__tx.attachment.update.mockResolvedValue({ id: 'att-1' });
    prisma.__tx.attachment.findUniqueOrThrow.mockResolvedValue({
      id: 'att-1',
      sizeBytes: BigInt(3),
      status: 'APPROVED',
      category: { id: 'cat-1', code: 'JUSTIFICATIVA_TECNICA' },
      targets: [{ id: 'target-1', featureId: BigInt(1), status: 'APPROVED' }],
    });

    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: null,
      isPlatformAdmin: true,
      subject: 'sub-1',
    };

    await service.createAttachment(
      actor,
      {
        categoryCode: 'JUSTIFICATIVA_TECNICA',
        visibility: 'PUBLIC',
        targets: [
          {
            datasetCode: 'PRODES_CERRADO_NB_2021',
            featureId: '1',
            scope: 'PLATFORM_CAR',
            carKey: 'CAR-1',
            validFrom: '2026-04-16',
          },
        ],
      },
      {
        buffer: Buffer.from('pdf'),
        originalname: 'arquivo.pdf',
        mimetype: 'application/pdf',
        size: 3,
      },
      '127.0.0.1',
    );

    expect(prisma.__tx.attachmentTarget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('creates map filter grant with canonical hash and source contract', async () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    const result = await service.createMapFilter(
      actor,
      {
        datasetCodes: ['TERRAS_INDIGENAS', 'UNIDADES_CONSERVACAO'],
        q: 'serra',
        intersectsCarOnly: true,
        carKey: 'MT-123',
      },
      'http://localhost:3001',
    );

    expect(result.filterHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.renderMode).toBe('mvt');
    expect(result.vectorSource.tiles[0]).toContain('/v1/attachments/tiles/');
    expect(result.vectorSource.maxzoom).toBe(11);
    expect(result.mapOptions?.minZoom).toBe(1);
    expect(result.mapOptions?.maxZoom).toBe(20);
    expect(result.mapOptions?.centroidMaxZoom).toBe(10);
    expect(result.mapOptions?.centroidHoldMaxMs).toBe(30000);
    expect(result.mapOptions?.prefetchMinZoom).toBe(9);
    expect(result.mapOptions?.prefetchTargetZoom).toBe(11);
    expect(result.mapOptions?.prefetchMaxVisibleCentroids).toBe(60);
    expect(result.mapOptions?.prefetchQueueCap).toBe(80);
    expect(result.mapOptions?.prefetchConcurrency).toBe(2);
    expect(result.mapOptions?.prefetchInteractionTileRadius).toBe(0);
    expect(result.mapOptions?.refreshExpiredTiles).toBe(false);
    expect(result.mapOptions?.maxBounds).toBeUndefined();
    expect(prisma.attachmentMapFilterSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filterHash: result.filterHash,
          actorUserId: 'user-1',
          actorOrgId: 'org-1',
        }),
      }),
    );
  });

  it('returns PMTiles render mode for dataset-only filter when all assets are active', async () => {
    process.env.ATTACHMENTS_PMTILES_ENABLED = 'true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        asset_id: 11,
        dataset_id: 21,
        dataset_code: 'TERRAS_INDIGENAS',
        category_code: 'TI',
        version_id: 31,
        snapshot_date: new Date('2026-04-18'),
        source_layer: 'attachments_features',
        blob_container: 'landwatch-private',
        blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
        blob_etag: '"etag-1"',
        blob_size_bytes: 1024,
        feature_count: 394,
        minzoom: 0,
        maxzoom: 14,
        bounds_west: -74.5,
        bounds_south: -34.8,
        bounds_east: -32,
        bounds_north: 6.5,
        center_lng: -52,
        center_lat: -10,
        center_zoom: 4,
      },
    ]);
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    const result = await service.createMapFilter(
      actor,
      {
        datasetCodes: ['TERRAS_INDIGENAS'],
      },
      'http://localhost:3001',
    );

    expect(result.renderMode).toBe('pmtiles');
    expect(result.vectorSource).toBeUndefined();
    expect(result.stats?.totalFeatures).toBe(394);
    expect(result.pmtilesSources).toEqual([
      expect.objectContaining({
        assetId: 11,
        datasetCode: 'TERRAS_INDIGENAS',
        archiveUrl:
          'http://localhost:3001/v1/attachments/pmtiles/assets/11.pmtiles',
        featureCount: 394,
        sourceLayer: 'attachments_features',
      }),
    ]);
  });

  it('falls back to MVT when at least one selected dataset has no PMTiles asset', async () => {
    process.env.ATTACHMENTS_PMTILES_ENABLED = 'true';
    const prisma = makePrismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          asset_id: 11,
          dataset_id: 21,
          dataset_code: 'TERRAS_INDIGENAS',
          category_code: 'TI',
          version_id: 31,
          snapshot_date: new Date('2026-04-18'),
          source_layer: 'attachments_features',
          blob_container: 'landwatch-private',
          blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
          blob_etag: '"etag-1"',
          blob_size_bytes: 1024,
          feature_count: 394,
          minzoom: 0,
          maxzoom: 14,
          bounds_west: -74.5,
          bounds_south: -34.8,
          bounds_east: -32,
          bounds_north: 6.5,
          center_lng: -52,
          center_lat: -10,
          center_zoom: 4,
        },
      ])
      .mockResolvedValueOnce([{ total: 394 }]);
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    const result = await service.createMapFilter(
      actor,
      {
        datasetCodes: ['TERRAS_INDIGENAS', 'UNIDADES_CONSERVACAO'],
      },
      'http://localhost:3001',
    );

    expect(result.renderMode).toBe('mvt');
    expect(result.vectorSource?.tiles[0]).toContain('/v1/attachments/tiles/');
  });

  it('keeps MVT mode for dynamic filters even when PMTiles is enabled', async () => {
    process.env.ATTACHMENTS_PMTILES_ENABLED = 'true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ total: 12 }]);
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    const result = await service.createMapFilter(
      actor,
      {
        datasetCodes: ['TERRAS_INDIGENAS'],
        q: 'serra',
      },
      'http://localhost:3001',
    );

    expect(result.renderMode).toBe('mvt');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('uses CAR-first strategy for map filter count when intersectsCarOnly is true', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ total: 3 }]);
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    await service.createMapFilter(
      actor,
      {
        datasetCodes: ['PRODES_MATA_ATLANTICA_NB_2020'],
        intersectsCarOnly: true,
        carKey: 'SP-3535606-B3B3B07478D544B69D33D647040FDC24',
      },
      'http://localhost:3001',
    );

    const sqlArg = prisma.$queryRaw.mock.calls[0][0] as any;
    const sqlText = Array.isArray(sqlArg?.strings)
      ? sqlArg.strings.join(' ')
      : String(sqlArg);
    expect(sqlText).toContain('candidate_geoms AS MATERIALIZED');
    expect(sqlText).toContain('CROSS JOIN car_feature car');
    expect(sqlText).toContain('g.geom && car.geom_4674');
  });

  it('locks map bounds only when ATTACHMENTS_MVT_MAP_LOCK_BOUNDS=true', async () => {
    process.env.ATTACHMENTS_MVT_MAP_LOCK_BOUNDS = 'true';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    const result = await service.createMapFilter(
      actor,
      {
        datasetCodes: ['TERRAS_INDIGENAS'],
      },
      'http://localhost:3001',
    );

    expect(result.mapOptions?.maxBounds).toEqual([
      [-74.5, -34.8],
      [-32.0, 6.5],
    ]);
  });

  it('maps zoom to tile geometry profile', () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const getProfile = (z: number) =>
      (service as any).getTileGeomProfileForZoom(z);

    expect(getProfile(3)).toBe('geom_3857_s600');
    expect(getProfile(6)).toBe('geom_3857_s300');
    expect(getProfile(8)).toBe('geom_3857_s140');
    expect(getProfile(9)).toBe('geom_3857_s70');
    expect(getProfile(10)).toBe('geom_3857_s70');
    expect(getProfile(11)).toBe('geom_3857_s35');
    expect(getProfile(12)).toBe('geom_3857_raw');
    expect(getProfile(16)).toBe('geom_3857_raw');
  });

  it('uses stronger simplify tolerance for low zoom levels', () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const getTolerance = (z: number) =>
      (service as any).getMvtSimplifyToleranceMeters(z);

    expect(getTolerance(4)).toBe(1200);
    expect(getTolerance(5)).toBe(1200);
    expect(getTolerance(6)).toBe(600);
    expect(getTolerance(8)).toBe(300);
    expect(getTolerance(9)).toBe(140);
    expect(getTolerance(10)).toBe(140);
    expect(getTolerance(11)).toBe(35);
    expect(getTolerance(12)).toBe(10);
    expect(getTolerance(13)).toBe(10);
    expect(getTolerance(14)).toBe(0);
  });

  it('uses conservative small-area threshold for centroid fallback by default', () => {
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const getThreshold = () =>
      (service as any).getMvtCentroidSmallTileAreaThreshold();

    expect(getThreshold()).toBe(256);
  });

  it('returns tile cache-control tuned for client reuse by default', async () => {
    process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV = 'true';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    prisma.attachmentMapFilterSession.findFirst.mockResolvedValue({
      filtersJson: {
        datasetCodes: ['TERRAS_INDIGENAS'],
        intersectsCarOnly: false,
      },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ dataset_id: 4 }])
      .mockResolvedValueOnce([{ tile: Buffer.alloc(0), feature_count: 0 }]);

    const result = await service.getVectorTile(actor, 'c'.repeat(64), 4, 4, 8);
    expect(result.cacheControl).toContain('max-age=1800');
    expect(result.cacheControl).toContain('stale-while-revalidate=86400');
  });

  it('enables preprocessed MV path by default when env is unset', () => {
    delete process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV;
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    expect((service as any).isMvtPreprocessedMvEnabled()).toBe(true);
  });

  it('uses preprocessed tile MV when feature flag is enabled', async () => {
    process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV = 'true';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    prisma.attachmentMapFilterSession.findFirst.mockResolvedValue({
      filtersJson: {
        datasetCodes: ['TERRAS_INDIGENAS'],
        intersectsCarOnly: false,
      },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ dataset_id: 4 }])
      .mockResolvedValueOnce([{ tile: Buffer.alloc(0), feature_count: 0 }]);

    await service.getVectorTile(actor, 'a'.repeat(64), 4, 4, 8);

    const sqlArg = prisma.$queryRaw.mock.calls[1][0] as any;
    const sqlText = Array.isArray(sqlArg?.strings)
      ? sqlArg.strings.join(' ')
      : String(sqlArg);
    expect(sqlText).toContain('"mv_feature_geom_tile_active"');
    expect(sqlText).toContain('g."geom_3857_s600"');
    expect(sqlText).toContain('candidate_geoms AS MATERIALIZED');
    expect(sqlText).toContain('g.geom_3857_raw AS geom_3857_raw');
    expect(sqlText).toContain('g.geom_3857_raw && cfg.query_bounds_3857');
    expect(sqlText).toContain('"mv_feature_tooltip_active"');
    expect(sqlText).toContain('tt.natural_id');
    expect(sqlText).toContain('tt.display_name');
    expect(sqlText).toContain('p.natural_id');
    expect(sqlText).toContain('p.display_name');
    expect(sqlText).toContain('ST_SimplifyPreserveTopology');
    expect(sqlText).toContain('ST_Centroid(ST_Envelope');
    expect(sqlText).toContain('ST_Area(c.polygon_geom)');
    expect(sqlText).not.toContain('ST_Area(ST_Envelope(c.polygon_geom))');
  });

  it('uses raw geometry predicate for intersectsCarOnly in preprocessed path', async () => {
    process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV = 'true';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    prisma.attachmentMapFilterSession.findFirst.mockResolvedValue({
      filtersJson: {
        datasetCodes: ['TERRAS_INDIGENAS'],
        intersectsCarOnly: true,
        carKey: 'MT-123',
      },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ dataset_id: 4 }])
      .mockResolvedValueOnce([{ tile: Buffer.alloc(0), feature_count: 0 }]);

    await service.getVectorTile(actor, 'd'.repeat(64), 4, 4, 8);

    const sqlArg = prisma.$queryRaw.mock.calls[1][0] as any;
    const sqlText = Array.isArray(sqlArg?.strings)
      ? sqlArg.strings.join(' ')
      : String(sqlArg);
    expect(sqlText).toContain('"mv_feature_geom_active"');
    expect(sqlText).toContain('g.geom_3857_raw && car.geom_3857');
    expect(sqlText).toContain('ST_Intersects(g.geom_3857_raw, car.geom_3857)');
    expect(sqlText).toContain('candidate_geoms AS MATERIALIZED');
  });

  it('uses runtime simplify path when preprocessed feature flag is disabled', async () => {
    process.env.ATTACHMENTS_MVT_USE_PREPROCESSED_MV = 'false';
    const prisma = makePrismaMock();
    const service = new AttachmentsService(prisma as any);
    const actor = {
      userId: 'user-1',
      orgId: 'org-1',
      isPlatformAdmin: false,
      subject: 'sub-1',
    };

    prisma.attachmentMapFilterSession.findFirst.mockResolvedValue({
      filtersJson: {
        datasetCodes: ['TERRAS_INDIGENAS'],
        intersectsCarOnly: false,
      },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ dataset_id: 4 }])
      .mockResolvedValueOnce([{ tile: Buffer.alloc(0), feature_count: 0 }]);

    await service.getVectorTile(actor, 'b'.repeat(64), 4, 4, 8);

    const sqlArg = prisma.$queryRaw.mock.calls[1][0] as any;
    const sqlText = Array.isArray(sqlArg?.strings)
      ? sqlArg.strings.join(' ')
      : String(sqlArg);
    expect(sqlText).toContain('"mv_feature_geom_active"');
    expect(sqlText).toContain('ST_SimplifyPreserveTopology');
    expect(sqlText).toContain('candidate_geoms AS MATERIALIZED');
    expect(sqlText).toContain('g.geom && cfg.query_bounds_4674');
    expect(sqlText).toContain('"mv_feature_tooltip_active"');
    expect(sqlText).toContain('tt.natural_id');
    expect(sqlText).toContain('tt.display_name');
    expect(sqlText).toContain('p.natural_id');
    expect(sqlText).toContain('p.display_name');
    expect(sqlText).toContain('ST_Centroid(ST_Envelope');
    expect(sqlText).toContain('ST_Area(c.polygon_geom)');
    expect(sqlText).not.toContain('ST_Area(ST_Envelope(c.polygon_geom))');
  });

  it('serves PMTiles proxy HEAD responses from registry metadata', async () => {
    process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        asset_id: 11,
        dataset_id: 21,
        dataset_code: 'TERRAS_INDIGENAS',
        category_code: 'TI',
        version_id: 31,
        snapshot_date: new Date('2026-04-18'),
        source_layer: 'attachments_features',
        blob_container: 'landwatch-private',
        blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
        blob_etag: '"etag-1"',
        blob_size_bytes: 1024,
        feature_count: 394,
        minzoom: 0,
        maxzoom: 14,
        bounds_west: -74.5,
        bounds_south: -34.8,
        bounds_east: -32,
        bounds_north: 6.5,
        center_lng: -52,
        center_lat: -10,
        center_zoom: 4,
      },
    ]);
    const service = new AttachmentsService(prisma as any);

    const result = await service.getPmtilesArchive('11', 'HEAD', {});

    expect(result.statusCode).toBe(200);
    expect(result.stream).toBeNull();
    expect(result.headers['Accept-Ranges']).toBe('bytes');
    expect(result.headers['Content-Length']).toBe('1024');
    expect(result.headers.ETag).toBe('"etag-1"');
  });

  it('returns 304 for PMTiles proxy when If-None-Match matches registry etag', async () => {
    process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        asset_id: 11,
        dataset_id: 21,
        dataset_code: 'TERRAS_INDIGENAS',
        category_code: 'TI',
        version_id: 31,
        snapshot_date: new Date('2026-04-18'),
        source_layer: 'attachments_features',
        blob_container: 'landwatch-private',
        blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
        blob_etag: '"etag-1"',
        blob_size_bytes: 1024,
        feature_count: 394,
        minzoom: 0,
        maxzoom: 14,
        bounds_west: -74.5,
        bounds_south: -34.8,
        bounds_east: -32,
        bounds_north: 6.5,
        center_lng: -52,
        center_lat: -10,
        center_zoom: 4,
      },
    ]);
    const service = new AttachmentsService(prisma as any);

    const result = await service.getPmtilesArchive('11', 'GET', {
      ifNoneMatch: '"etag-1"',
    });

    expect(result.statusCode).toBe(304);
    expect(result.stream).toBeNull();
  });

  it('serves PMTiles proxy range requests through blob download', async () => {
    process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        asset_id: 11,
        dataset_id: 21,
        dataset_code: 'TERRAS_INDIGENAS',
        category_code: 'TI',
        version_id: 31,
        snapshot_date: new Date('2026-04-18'),
        source_layer: 'attachments_features',
        blob_container: 'landwatch-private',
        blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
        blob_etag: '"etag-1"',
        blob_size_bytes: 1024,
        feature_count: 394,
        minzoom: 0,
        maxzoom: 14,
        bounds_west: -74.5,
        bounds_south: -34.8,
        bounds_east: -32,
        bounds_north: 6.5,
        center_lng: -52,
        center_lat: -10,
        center_zoom: 4,
      },
    ]);
    const download = jest.fn().mockResolvedValue({
      readableStreamBody: Readable.from(Buffer.from('abc')),
    });
    const getBlobClient = jest.fn().mockReturnValue({ download });
    const getContainerClient = jest.fn().mockReturnValue({ getBlobClient });
    const service = new AttachmentsService(prisma as any);
    jest
      .spyOn(service as any, 'getPmtilesBlobServiceClient')
      .mockReturnValue({ getContainerClient });

    const result = await service.getPmtilesArchive('11', 'GET', {
      range: 'bytes=0-2',
    });

    expect(result.statusCode).toBe(206);
    expect(result.headers['Content-Range']).toBe('bytes 0-2/1024');
    expect(download).toHaveBeenCalledWith(0, 3);
    expect(result.stream).not.toBeNull();
  });

  it('returns 416 for invalid PMTiles range requests', async () => {
    process.env.ATTACHMENTS_PMTILES_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        asset_id: 11,
        dataset_id: 21,
        dataset_code: 'TERRAS_INDIGENAS',
        category_code: 'TI',
        version_id: 31,
        snapshot_date: new Date('2026-04-18'),
        source_layer: 'attachments_features',
        blob_container: 'landwatch-private',
        blob_path: 'pmtiles/TERRAS_INDIGENAS/31/TERRAS_INDIGENAS.pmtiles',
        blob_etag: '"etag-1"',
        blob_size_bytes: 1024,
        feature_count: 394,
        minzoom: 0,
        maxzoom: 14,
        bounds_west: -74.5,
        bounds_south: -34.8,
        bounds_east: -32,
        bounds_north: 6.5,
        center_lng: -52,
        center_lat: -10,
        center_zoom: 4,
      },
    ]);
    const service = new AttachmentsService(prisma as any);

    const result = await service.getPmtilesArchive('11', 'GET', {
      range: 'bytes=9999-10000',
    });

    expect(result.statusCode).toBe(416);
    expect(result.headers['Content-Range']).toBe('bytes */1024');
  });
});
