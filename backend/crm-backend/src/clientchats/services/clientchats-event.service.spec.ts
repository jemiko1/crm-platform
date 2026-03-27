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
});
