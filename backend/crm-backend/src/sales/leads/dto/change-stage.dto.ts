import { IsString, IsOptional, IsUUID } from 'class-validator';

export class ChangeStageDto {
  @IsUUID()
  stageId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
