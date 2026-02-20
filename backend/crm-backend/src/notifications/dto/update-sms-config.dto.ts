import { IsString, IsBoolean, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateSmsConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() provider?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountSid?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() authToken?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
