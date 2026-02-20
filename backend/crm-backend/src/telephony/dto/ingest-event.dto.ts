import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TELEPHONY_EVENT_TYPES } from '../types/telephony.types';
import type { TelephonyEventType } from '../types/telephony.types';

export class IngestEventItemDto {
  @IsEnum(TELEPHONY_EVENT_TYPES)
  eventType: TelephonyEventType;

  @IsDateString()
  timestamp: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  linkedId?: string;

  @IsOptional()
  @IsString()
  uniqueId?: string;
}

export class IngestEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEventItemDto)
  events: IngestEventItemDto[];
}
