import { ClientChatChannelType } from "@prisma/client";
import { AdapterRegistryService } from "./adapter-registry.service";

describe("AdapterRegistryService", () => {
  const adapter = (type: ClientChatChannelType) => ({ channelType: type });

  let service: AdapterRegistryService;

  beforeEach(() => {
    service = new AdapterRegistryService(
      adapter(ClientChatChannelType.WEB) as any,
      adapter(ClientChatChannelType.VIBER) as any,
      adapter(ClientChatChannelType.FACEBOOK) as any,
      adapter(ClientChatChannelType.TELEGRAM) as any,
      adapter(ClientChatChannelType.WHATSAPP) as any,
    );
  });

  describe("get", () => {
    it("should return adapter when channel type is registered", () => {
      expect(service.get(ClientChatChannelType.VIBER)?.channelType).toBe(
        ClientChatChannelType.VIBER,
      );
    });
  });

  describe("listChannelTypes", () => {
    it("should list all registered channel types", () => {
      const types = service.listChannelTypes();
      expect(types.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("getOrThrow", () => {
    it("should return adapter for registered type", () => {
      expect(service.getOrThrow(ClientChatChannelType.TELEGRAM).channelType).toBe(
        ClientChatChannelType.TELEGRAM,
      );
    });
  });
});
