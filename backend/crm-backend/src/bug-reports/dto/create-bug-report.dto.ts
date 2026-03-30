import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsArray,
} from "class-validator";
import { BugSeverity, BugCategory } from "@prisma/client";

export class CreateBugReportDto {
  @IsString()
  description: string;

  @IsEnum(BugSeverity)
  severity: BugSeverity;

  @IsEnum(BugCategory)
  @IsOptional()
  category?: BugCategory;

  @IsString()
  pageUrl: string;

  @IsObject()
  browserInfo: Record<string, unknown>;

  @IsArray()
  actionLog: unknown[];

  @IsArray()
  consoleLog: unknown[];

  @IsArray()
  networkLog: unknown[];

  @IsArray()
  @IsOptional()
  screenshots?: unknown[];
}
