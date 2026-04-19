import { ClientChatsEventService } from "./clientchats-event.service";

describe("ClientChatsEventService", () => {
  let service: ClientChatsEventService;

  beforeEach(() => {
    service = new ClientChatsEventService();
  });

  describe("emitConversationNew", () => {
    it("should not throw when server is not attached", () => {
      expect(() =>
        service.emitConversationNew({ id: "c1", assignedUserId: null }),
      ).not.toThrow();
    });
  });

  describe("refreshQueueMembership", () => {
    it("returns empty diff when server is not attached", async () => {
      const res = await service.refreshQueueMembership(["u1"]);
      expect(res).toEqual({ joined: [], left: [] });
    });

    it("joins sockets that should be in queue but aren't, and leaves those that shouldn't but are", async () => {
      const mk = (id: string, userId: string | undefined, inQueue: boolean) => ({
        id,
        data: userId ? { userId } : {},
        rooms: new Set<string>(inQueue ? ["queue"] : []),
        join: jest.fn(async function (this: any, room: string) {
          (this.rooms as Set<string>).add(room);
        }),
        leave: jest.fn(async function (this: any, room: string) {
          (this.rooms as Set<string>).delete(room);
        }),
        emit: jest.fn(),
      });

      const socketA = mk("sA", "u1", false); // should join (in list, not yet in room)
      const socketB = mk("sB", "u2", true); // should stay (in list, in room)
      const socketC = mk("sC", "u3", true); // should leave (not in list, in room)
      const socketD = mk("sD", "u4", false); // already correct (not in list, not in room)
      const socketE = mk("sE", undefined, false); // no userId — skip

      const mockServer: any = {
        fetchSockets: jest
          .fn()
          .mockResolvedValue([socketA, socketB, socketC, socketD, socketE]),
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      service.setServer(mockServer);

      const res = await service.refreshQueueMembership(["u1", "u2"]);

      expect(res.joined).toEqual(["u1"]);
      expect(res.left).toEqual(["u3"]);
      expect(socketA.join).toHaveBeenCalledWith("queue");
      expect(socketA.emit).toHaveBeenCalledWith("queue:membership-changed", {
        inQueue: true,
      });
      expect(socketC.leave).toHaveBeenCalledWith("queue");
      expect(socketC.emit).toHaveBeenCalledWith("queue:membership-changed", {
        inQueue: false,
      });
      // No-ops:
      expect(socketB.join).not.toHaveBeenCalled();
      expect(socketB.leave).not.toHaveBeenCalled();
      expect(socketD.join).not.toHaveBeenCalled();
      expect(socketD.leave).not.toHaveBeenCalled();
      expect(socketE.join).not.toHaveBeenCalled();
      expect(socketE.leave).not.toHaveBeenCalled();
    });

    it("swallows fetchSockets errors and returns empty diff", async () => {
      const mockServer: any = {
        fetchSockets: jest.fn().mockRejectedValue(new Error("disconnected")),
      };
      service.setServer(mockServer);

      const res = await service.refreshQueueMembership(["u1"]);
      expect(res).toEqual({ joined: [], left: [] });
    });
  });

  describe("emitQueueUpdated", () => {
    it("is a no-op when no server is attached", () => {
      expect(() => service.emitQueueUpdated({ reason: "test" })).not.toThrow();
    });

    it("broadcasts to the managers room when server is attached", () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      const mockServer: any = { to };
      service.setServer(mockServer);

      service.emitQueueUpdated({ reason: "test" });

      expect(to).toHaveBeenCalledWith("managers");
      expect(emit).toHaveBeenCalledWith("queue:updated", { reason: "test" });
    });
  });
});
