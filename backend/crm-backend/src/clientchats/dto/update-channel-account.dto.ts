import { IsOptional, IsString, IsObject } from 'class-validator';

export class UpdateChannelAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
