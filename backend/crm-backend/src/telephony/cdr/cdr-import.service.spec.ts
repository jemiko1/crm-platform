import { Test, TestingModule } from "@nestjs/testing";
import { CdrImportService } from "./cdr-import.service";
import { TelephonyIngestionService } from "../services/telephony-ingestion.service";

describe("CdrImportService", () => {
  const prevEnabled = process.env.CDR_IMPORT_ENABLED;
  const prevUrl = process.env.CDR_DB_URL;

  afterEach(() => {
    process.env.CDR_IMPORT_ENABLED = prevEnabled;
    process.env.CDR_DB_URL = prevUrl;
  });

  it("importCdr should not call ingestion when import is disabled", async () => {
    process.env.CDR_IMPORT_ENABLED = "false";
    process.env.CDR_DB_URL = "postgres://example";
    const ingestBatch = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CdrImportService,
        { provide: TelephonyIngestionService, useValue: { ingestBatch } },
      ],
    }).compile();
    const service = module.get(CdrImportService);
    await service.importCdr();
    expect(ingestBatch).not.toHaveBeenCalled();
  });
});
