import { IsString, IsBoolean, IsOptional, IsInt, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateSmsConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() apiKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(2) smsNo?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) maxPerMinute?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) maxPerHour?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10000) maxPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) recipientCooldownMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) maxBatchRecipients?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoDisableOnLimit?: boolean;
}
