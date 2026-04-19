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

  describe("idempotency keys — P1-8 regression", () => {
    const transferEvent = {
      event: "BlindTransfer",
      linkedid: "1713551234.100",
      uniqueid: "1713551234.100",
      transfertargetchannel: "PJSIP/202-abc",
      destchannel: "PJSIP/203-def",
      channel: "PJSIP/201-xyz",
      calleridnum: "995599224774",
    };

    const holdStartEvent = {
      event: "MusicOnHoldStart",
      linkedid: "1713551234.100",
      uniqueid: "1713551234.100",
      channel: "PJSIP/201-xyz",
      timestamp: "1713551240.123456",
    };

    const holdEndEvent = {
      event: "MusicOnHoldStop",
      linkedid: "1713551234.100",
      uniqueid: "1713551234.100",
      channel: "PJSIP/201-xyz",
      timestamp: "1713551245.123456",
    };

    it("transfer: same event produces identical key across mapper instances (restart-stable)", () => {
      const a = service.mapEvent(transferEvent as any);
      const b = service.mapEvent(transferEvent as any);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a![0].idempotencyKey).toBe(b![0].idempotencyKey);
    });

    it("transfer: key has no Date.now() suffix (must not end in 13 digits)", () => {
      const [evt] = service.mapEvent(transferEvent as any)!;
      expect(evt.idempotencyKey).not.toMatch(/:\d{13}$/);
      expect(evt.idempotencyKey).toMatch(
        /^ami:transfer:1713551234\.100:1713551234\.100:PJSIP\/202-abc$/,
      );
    });

    it("transfer: distinct target channels produce distinct keys", () => {
      const a = service.mapEvent(transferEvent as any);
      const b = service.mapEvent({
        ...transferEvent,
        transfertargetchannel: "PJSIP/204-ghi",
      } as any);
      expect(a![0].idempotencyKey).not.toBe(b![0].idempotencyKey);
    });

    it("hold_start: same event produces identical key (restart-stable)", () => {
      const a = service.mapEvent(holdStartEvent as any);
      const b = service.mapEvent(holdStartEvent as any);
      expect(a![0].idempotencyKey).toBe(b![0].idempotencyKey);
    });

    it("hold_start vs hold_end produce different keys", () => {
      const [start] = service.mapEvent(holdStartEvent as any)!;
      const [end] = service.mapEvent(holdEndEvent as any)!;
      expect(start.idempotencyKey).not.toBe(end.idempotencyKey);
    });

    it("hold: key has no Date.now() suffix", () => {
      const [evt] = service.mapEvent(holdStartEvent as any)!;
      expect(evt.idempotencyKey).not.toMatch(/:\d{13}$/);
      expect(evt.idempotencyKey).toContain("hold_start");
      expect(evt.idempotencyKey).toContain("1713551240.123456");
    });

    it("hold: two cycles with distinct timestamps produce distinct keys", () => {
      const [first] = service.mapEvent(holdStartEvent as any)!;
      const [second] = service.mapEvent({
        ...holdStartEvent,
        timestamp: "1713551250.654321",
      } as any)!;
      expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    });

    it("hold: without timestamp falls back to linkedid (collapses cycles — DOCUMENTED LIMITATION)", () => {
      // Production Asterisk has `timestampevents: No` (see audit/ASTERISK_INVENTORY.md §4).
      // Multiple hold cycles on the same channel will collide to one key until
      // `timestampevents=yes` is enabled in the FreePBX GUI. This test pins that
      // behavior so future refactors don't silently change it.
      const noTsEvent = { ...holdStartEvent, timestamp: undefined };
      const a = service.mapEvent(noTsEvent as any);
      const b = service.mapEvent(noTsEvent as any);
      expect(a![0].idempotencyKey).toBe(b![0].idempotencyKey);
    });
  });
});
