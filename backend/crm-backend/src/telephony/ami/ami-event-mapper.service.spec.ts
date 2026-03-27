import { Test, TestingModule } from "@nestjs/testing";
import { AmiEventMapperService } from "./ami-event-mapper.service";
import { AmiClientService } from "./ami-client.service";
import { TelephonyIngestionService } from "../services/telephony-ingestion.service";

describe("AmiEventMapperService", () => {
  let service: AmiEventMapperService;
  let ami: { on: jest.Mock };
  let ingestion: { ingestBatch: jest.Mock };

  beforeEach(async () => {
    ami = { on: jest.fn() };
    ingestion = { ingestBatch: jest.fn().mockResolvedValue({ processed: 0, skipped: 0, errors: [] }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmiEventMapperService,
        { provide: AmiClientService, useValue: ami },
        { provide: TelephonyIngestionService, useValue: ingestion },
      ],
    }).compile();
    service = module.get(AmiEventMapperService);
  });

  describe("onModuleInit", () => {
    it("should subscribe to ami:event on AMI client", () => {
      service.onModuleInit();
      expect(ami.on).toHaveBeenCalledWith("ami:event", expect.any(Function));
    });
  });
});
