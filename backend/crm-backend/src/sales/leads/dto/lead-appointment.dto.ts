import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateLeadAppointmentDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;
}

export class UpdateLeadAppointmentDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;
}

export class CompleteAppointmentDto {
  @IsString()
  @IsOptional()
  outcome?: string;
}
