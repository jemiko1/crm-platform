import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum ApprovalAction {
  APPROVE = 'APPROVE',
  UNLOCK = 'UNLOCK',
  CANCEL = 'CANCEL',
}

export class ApprovalActionDto {
  @IsEnum(ApprovalAction)
  action: ApprovalAction;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  lostReason?: string;
}

export class SubmitForApprovalDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
