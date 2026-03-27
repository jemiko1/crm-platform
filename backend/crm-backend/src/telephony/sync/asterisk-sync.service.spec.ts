import { Test, TestingModule } from "@nestjs/testing";
import { AsteriskSyncService } from "./asterisk-sync.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AmiClientService } from "../ami/ami-client.service";
import { TelephonyStateManager } from "../realtime/telephony-state.manager";

describe("AsteriskSyncService", () => {
  const prevAmi = process.env.AMI_ENABLED;

  afterEach(() => {
    process.env.AMI_ENABLED = prevAmi;
  });

  it("syncAll should return early when AMI disabled", async () => {
    process.env.AMI_ENABLED = "false";
    const prisma = { telephonyQueue: { findMany: jest.fn() } };
    const ami = { connected: false, on: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsteriskSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmiClientService, useValue: ami },
        { provide: TelephonyStateManager, useValue: {} },
      ],
    }).compile();
    const service = module.get(AsteriskSyncService);
    await service.syncAll();
    expect(prisma.telephonyQueue.findMany).not.toHaveBeenCalled();
  });
});
