import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { OperatorDndService } from "./operator-dnd.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AmiClientService } from "../ami/ami-client.service";
import { TelephonyStateManager } from "../realtime/telephony-state.manager";

/**
 * Tests for OperatorDndService.
 *
 * Since DND state lives in Asterisk (AMI QueuePause) and the in-memory
 * TelephonyStateManager cache (updated by AMI events), these tests
 * verify the AMI payload shape + the state-read path. No DB write
 * paths to test — we don't persist DND state.
 */
describe("OperatorDndService", () => {
  let service: OperatorDndService;
  let prisma: { telephonyExtension: { findUnique: jest.Mock } };
  let ami: { sendAction: jest.Mock };
  let state: { getAgentState: jest.Mock };

  beforeEach(async () => {
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn().mockResolvedValue({
          extension: "200",
          isActive: true,
        }),
      },
    };
    ami = { sendAction: jest.fn().mockResolvedValue({ Response: "Success" }) };
    state = {
      getAgentState: jest
        .fn()
        .mockReturnValue({ presence: "IDLE", extension: "200" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorDndService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmiClientService, useValue: ami },
        { provide: TelephonyStateManager, useValue: state },
      ],
    }).compile();
    service = module.get(OperatorDndService);
  });

  describe("enable", () => {
    it("sends QueuePause with Paused=true and no Queue field (all queues)", async () => {
      const result = await service.enable("user-1");

      expect(ami.sendAction).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "QueuePause",
          Interface: "Local/200@from-queue/n",
          Paused: "true",
          Reason: "Operator DND",
        }),
      );
      // Omitting Queue pauses across every queue the extension is a
      // member of — that's what "DND" means semantically.
      const payload = ami.sendAction.mock.calls[0][0];
      expect(payload.Queue).toBeUndefined();

      expect(result).toEqual({ enabled: true, extension: "200" });
    });

    it("throws BadRequestException when user has no extension", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      await expect(service.enable("user-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(ami.sendAction).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when extension is inactive", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        extension: "200",
        isActive: false,
      });
      await expect(service.enable("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("disable", () => {
    it("sends QueuePause with Paused=false", async () => {
      const result = await service.disable("user-1");
      expect(ami.sendAction).toHaveBeenCalledWith(
        expect.objectContaining({
          Action: "QueuePause",
          Interface: "Local/200@from-queue/n",
          Paused: "false",
        }),
      );
      expect(result).toEqual({ enabled: false, extension: "200" });
    });

    it("is idempotent — calling disable when already off still succeeds", async () => {
      // Asterisk accepts Paused=false on an already-unpaused member.
      // Our service just relays the AMI response.
      await service.disable("user-1");
      await service.disable("user-1");
      expect(ami.sendAction).toHaveBeenCalledTimes(2);
    });
  });

  describe("error translation", () => {
    // Field report (April 2026): DND returned generic 500s because
    // the Interface format was wrong (PJSIP/ext vs Local/ext@from-queue/n
    // that FreePBX actually uses). The first fix was the Interface
    // string; these tests cover the second fix — turning AMI "Interface
    // not found" and "not connected" errors into a clear 400 with a
    // message the operator can act on.
    //
    // IMPORTANT — rejection shapes:
    //   `asterisk-manager` rejects a `sendAction` promise in two
    //   distinct shapes depending on WHERE the failure occurred:
    //     (A) Pre-send (no TCP connection yet): our AmiClientService
    //         wrapper throws `new Error('AMI not connected')`.
    //     (B) Post-send (Asterisk returned Response: Error): the
    //         library passes the parsed event as a **plain object**
    //         with lowercased keys, e.g.
    //           { response: 'error', message: 'Interface not found',
    //             actionid: '...' }
    //         NOT an Error instance.
    //
    //   The first code-reviewer pass caught this: if these tests only
    //   mock `new Error(...)`, the service's `String(err)` fallback
    //   masks a real bug where the regex never matches a plain object
    //   in production. So the Interface-not-found test below
    //   deliberately rejects with shape (B) to match prod.
    it("translates AMI 'Interface not found' (plain-object shape) into a 400 with operator-actionable message", async () => {
      ami.sendAction.mockRejectedValue({
        response: "error",
        message: "Interface not found",
        actionid: "1776000000",
      });
      await expect(service.enable("user-1")).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/not a member of any queue/i),
      });
    });

    it("translates AMI 'not connected' (Error shape) into a 400 retry-soon message", async () => {
      ami.sendAction.mockRejectedValue(new Error("AMI not connected"));
      await expect(service.enable("user-1")).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/currently unreachable/i),
      });
    });

    it("passes unknown AMI Errors through unchanged", async () => {
      ami.sendAction.mockRejectedValue(new Error("kaboom unexpected"));
      await expect(service.enable("user-1")).rejects.toThrow(
        /kaboom unexpected/,
      );
    });

    it("lifts unknown plain-object rejections into an Error so the log isn't '[object Object]'", async () => {
      ami.sendAction.mockRejectedValue({
        response: "error",
        message: "Authorization refused for channel",
      });
      // Not one of the translated cases, so it propagates — but as
      // an Error with a real message the HttpExceptionFilter can log.
      await expect(service.enable("user-1")).rejects.toThrow(
        /AMI QueuePause failed: Authorization refused for channel/,
      );
    });
  });

  describe("disableSilently", () => {
    it("swallows errors (intended for logout best-effort)", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      await expect(service.disableSilently("user-1")).resolves.toBeUndefined();
    });

    it("swallows AMI errors", async () => {
      ami.sendAction.mockRejectedValue(new Error("AMI connection lost"));
      await expect(service.disableSilently("user-1")).resolves.toBeUndefined();
    });

    it("still sends the action when the path is healthy", async () => {
      await service.disableSilently("user-1");
      expect(ami.sendAction).toHaveBeenCalledWith(
        expect.objectContaining({ Action: "QueuePause", Paused: "false" }),
      );
    });
  });

  describe("getMyState", () => {
    it("returns enabled=true when agent presence is PAUSED", () => {
      state.getAgentState.mockReturnValue({
        presence: "PAUSED",
        extension: "200",
      });
      expect(service.getMyState("user-1")).toEqual({
        enabled: true,
        extension: "200",
      });
    });

    it("returns enabled=false for non-paused presence", () => {
      state.getAgentState.mockReturnValue({
        presence: "IDLE",
        extension: "200",
      });
      expect(service.getMyState("user-1")).toEqual({
        enabled: false,
        extension: "200",
      });
    });

    it("returns enabled=false with null extension when agent has no cached state", () => {
      state.getAgentState.mockReturnValue(undefined);
      expect(service.getMyState("user-1")).toEqual({
        enabled: false,
        extension: null,
      });
    });

    it("does NOT hit AMI or DB — pure in-memory read", () => {
      service.getMyState("user-1");
      expect(ami.sendAction).not.toHaveBeenCalled();
      expect(prisma.telephonyExtension.findUnique).not.toHaveBeenCalled();
    });
  });
});
