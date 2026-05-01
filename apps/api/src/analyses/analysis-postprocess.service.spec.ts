import { AnalysisKind, AnalysisPostprocessJobType } from '@prisma/client';
import { AnalysisPostprocessService } from './analysis-postprocess.service';

function makePrismaMock() {
  return {
    analysisPostprocessJob: {
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('AnalysisPostprocessService', () => {
  it('enqueues completion jobs without automatic attachments capture', async () => {
    const prisma = makePrismaMock();
    const service = new AnalysisPostprocessService(
      prisma as any,
      { updateCnpjInfoBestEffort: jest.fn() } as any,
      { createAlertForNovelIntersections: jest.fn() } as any,
      { captureEffectiveForAnalysis: jest.fn() } as any,
      { invalidate: jest.fn(), set: jest.fn() } as any,
      { getById: jest.fn(), getMapById: jest.fn(), getGeoJsonById: jest.fn() } as any,
      { getVectorMapMetadataById: jest.fn() } as any,
    );

    await service.enqueueAnalysisCompletionJobs({
      analysisId: 'analysis-1',
      analysisKind: AnalysisKind.STANDARD,
      farmId: null,
      scheduleId: null,
      cnpjDocs: ['12345678000190'],
    });

    const jobTypes = prisma.analysisPostprocessJob.create.mock.calls.map(
      ([arg]: any[]) => arg.data.jobType,
    );

    expect(jobTypes).toContain(AnalysisPostprocessJobType.CNPJ_REFRESH);
    expect(jobTypes).not.toContain(
      AnalysisPostprocessJobType.ATTACHMENTS_EFFECTIVE_CAPTURE,
    );
    expect(jobTypes).not.toContain(
      AnalysisPostprocessJobType.ANALYSIS_CACHE_BUILD,
    );
  });

  it('invalidates cache and enqueues cache build after attachments capture completes', async () => {
    const prisma = makePrismaMock();
    const attachments = {
      refreshAnalysisEffectiveSnapshot: jest
        .fn()
        .mockResolvedValue({ insertedCount: 2, changed: true }),
    };
    const cache = {
      invalidate: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AnalysisPostprocessService(
      prisma as any,
      { updateCnpjInfoBestEffort: jest.fn() } as any,
      { createAlertForNovelIntersections: jest.fn() } as any,
      attachments as any,
      cache as any,
      { getById: jest.fn(), getMapById: jest.fn(), getGeoJsonById: jest.fn() } as any,
      { getVectorMapMetadataById: jest.fn() } as any,
    );
    const enqueueSpy = jest.spyOn(service, 'enqueue').mockResolvedValue(undefined);

    await (service as any).runAttachmentsCapture({
      id: 'job-1',
      job_type: AnalysisPostprocessJobType.ATTACHMENTS_EFFECTIVE_CAPTURE,
      analysis_id: 'analysis-1',
      doc_normalized: null,
      dedupe_key: 'analysis:analysis-1:attachments_capture',
      status: 'RUNNING',
      attempt_count: 0,
      payload: null,
    });

    expect(attachments.refreshAnalysisEffectiveSnapshot).toHaveBeenCalledWith(
      'analysis-1',
    );
    expect(cache.invalidate).toHaveBeenCalledWith('analysis-1');
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: AnalysisPostprocessJobType.ANALYSIS_CACHE_BUILD,
        analysisId: 'analysis-1',
        dedupeKey: 'analysis:analysis-1:cache_build',
      }),
    );
  });

  it('skips cache rebuild when attachments capture does not change the snapshot', async () => {
    const prisma = makePrismaMock();
    const attachments = {
      refreshAnalysisEffectiveSnapshot: jest
        .fn()
        .mockResolvedValue({ insertedCount: 0, changed: false }),
    };
    const cache = {
      invalidate: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AnalysisPostprocessService(
      prisma as any,
      { updateCnpjInfoBestEffort: jest.fn() } as any,
      { createAlertForNovelIntersections: jest.fn() } as any,
      attachments as any,
      cache as any,
      { getById: jest.fn(), getMapById: jest.fn(), getGeoJsonById: jest.fn() } as any,
      { getVectorMapMetadataById: jest.fn() } as any,
    );
    const enqueueSpy = jest.spyOn(service, 'enqueue').mockResolvedValue(undefined);

    await (service as any).runAttachmentsCapture({
      id: 'job-1',
      job_type: AnalysisPostprocessJobType.ATTACHMENTS_EFFECTIVE_CAPTURE,
      analysis_id: 'analysis-1',
      doc_normalized: null,
      dedupe_key: 'analysis:analysis-1:attachments_capture',
      status: 'RUNNING',
      attempt_count: 0,
      payload: null,
    });

    expect(attachments.refreshAnalysisEffectiveSnapshot).toHaveBeenCalledWith(
      'analysis-1',
    );
    expect(cache.invalidate).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: AnalysisPostprocessJobType.ANALYSIS_CACHE_BUILD,
      }),
    );
  });

  it('swallows poller failures instead of leaking rejections', async () => {
    const prisma = makePrismaMock();
    const service = new AnalysisPostprocessService(
      prisma as any,
      { updateCnpjInfoBestEffort: jest.fn() } as any,
      { createAlertForNovelIntersections: jest.fn() } as any,
      { refreshAnalysisEffectiveSnapshot: jest.fn() } as any,
      { invalidate: jest.fn(), set: jest.fn() } as any,
      { getById: jest.fn(), getMapById: jest.fn(), getGeoJsonById: jest.fn() } as any,
      { getVectorMapMetadataById: jest.fn() } as any,
    );
    const loggerSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service as any, 'processDueJobs')
      .mockRejectedValue(new Error('db timeout'));

    await (service as any).runProcessDueJobsSafely('interval');
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"analysis.postprocess.poll.failed"'),
    );
  });
});
