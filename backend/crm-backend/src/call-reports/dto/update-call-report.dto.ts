import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { CallReportStatus } from '@prisma/client';

export class UpdateCallReportDto {
  @IsOptional()
  @IsString()
  callerClientId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  @IsOptional()
  @IsString()
  subjectClientId?: string;

  @IsOptional()
  @IsString()
  clientBuildingId?: string;

  @IsOptional()
  @IsString()
  buildingId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(CallReportStatus)
  status?: CallReportStatus;
}
