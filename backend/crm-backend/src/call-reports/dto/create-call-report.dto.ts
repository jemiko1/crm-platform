import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { CallReportStatus } from '@prisma/client';

export class CreateCallReportDto {
  @IsString()
  callSessionId: string;

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

  @IsArray()
  @IsString({ each: true })
  labels: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsEnum(CallReportStatus)
  status: CallReportStatus;
}
