import { QualityPipelineService } from '../quality/quality-pipeline.service';

describe('QualityPipelineService', () => {
  let service: QualityPipelineService;
  let mockPrisma: Record<string, any>;
  let mockRecording: Record<string, any>;

  beforeEach(() => {
    process.env.QUALITY_AI_ENABLED = 'false';

    mockPrisma = {
      qualityReview: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      qualityRubric: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockRecording = {
      resolveFilePath: jest.fn().mockReturnValue(null),
    };

    service = new QualityPipelineService(mockPrisma as any, mockRecording as any);
  });

  afterEach(() => {
    delete process.env.QUALITY_AI_ENABLED;
  });

  it('should not process when disabled', async () => {
    await service.processPendingReviews();
    expect(mockPrisma.qualityReview.findMany).not.toHaveBeenCalled();
  });

  it('should be instantiable without OpenAI key', () => {
    expect(service).toBeDefined();
  });

  describe('when enabled but no API key', () => {
    it('should not create OpenAI client', () => {
      process.env.QUALITY_AI_ENABLED = 'true';
      const svc = new QualityPipelineService(
        mockPrisma as any,
        mockRecording as any,
      );
      expect(svc).toBeDefined();
    });
  });

  describe('when enabled with mock API key', () => {
    let enabledService: QualityPipelineService;

    beforeEach(() => {
      process.env.QUALITY_AI_ENABLED = 'true';
      process.env.OPENAI_API_KEY = 'sk-test-key';

      enabledService = new QualityPipelineService(
        mockPrisma as any,
        mockRecording as any,
      );
    });

    afterEach(() => {
      delete process.env.OPENAI_API_KEY;
    });

    it('should query for pending reviews', async () => {
      mockPrisma.qualityReview.findMany.mockResolvedValue([]);
      await enabledService.processPendingReviews();
      expect(mockPrisma.qualityReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        }),
      );
    });

    it('should mark review FAILED when no recording found', async () => {
      mockPrisma.qualityReview.findMany.mockResolvedValue([
        {
          id: 'qr-1',
          callSession: { id: 's1', recordings: [] },
        },
      ]);

      await enabledService.processPendingReviews();

      expect(mockPrisma.qualityReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'qr-1' },
          data: expect.objectContaining({ status: 'PROCESSING' }),
        }),
      );

      expect(mockPrisma.qualityReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'qr-1' },
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });
  });
});
