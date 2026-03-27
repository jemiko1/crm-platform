import { Test, TestingModule } from "@nestjs/testing";
import { QualityPipelineService } from "./quality-pipeline.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RecordingAccessService } from "../recording/recording-access.service";

describe("QualityPipelineService", () => {
  const prevQ = process.env.QUALITY_AI_ENABLED;
  const prevKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.QUALITY_AI_ENABLED = prevQ;
    process.env.OPENAI_API_KEY = prevKey;
  });

  it("processPendingReviews should return early when AI disabled", async () => {
    process.env.QUALITY_AI_ENABLED = "false";
    const prisma = {
      qualityReview: { updateMany: jest.fn(), findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityPipelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: RecordingAccessService, useValue: {} },
      ],
    }).compile();
    const service = module.get(QualityPipelineService);
    await service.processPendingReviews();
    expect(prisma.qualityReview.updateMany).not.toHaveBeenCalled();
  });
});
