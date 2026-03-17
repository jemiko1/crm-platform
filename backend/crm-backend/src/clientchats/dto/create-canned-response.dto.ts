import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  MinLength,
} from 'class-validator';

const CHANNEL_TYPES = [
  'WEB',
  'VIBER',
  'FACEBOOK',
  'TELEGRAM',
  'WHATSAPP',
] as const;

export class CreateCannedResponseDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(CHANNEL_TYPES)
  channelType?: string;

  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
