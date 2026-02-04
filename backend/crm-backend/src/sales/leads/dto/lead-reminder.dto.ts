import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateLeadReminderDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  remindAt: string;
}

export class UpdateLeadReminderDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  remindAt?: string;
}
