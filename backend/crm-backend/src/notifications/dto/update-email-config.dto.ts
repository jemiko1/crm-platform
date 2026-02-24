import { IsString, IsInt, IsBoolean, IsOptional, IsEmail, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateEmailConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() smtpHost?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpUser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpPass?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() imapHost?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(65535) imapPort?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() imapSecure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() imapUser?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imapPass?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() fromName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() fromEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
