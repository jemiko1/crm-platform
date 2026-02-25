import { IsIn, IsNotEmpty, IsObject, IsString } from "class-validator";

export const CORE_EVENT_TYPES = [
  "building.upsert",
  "client.upsert",
  "asset.upsert",
  "building.deactivate",
  "client.deactivate",
  "asset.deactivate",
] as const;

export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

export class CoreWebhookDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsIn(CORE_EVENT_TYPES)
  eventType: CoreEventType;

  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;
}
