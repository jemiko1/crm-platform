import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryStatsDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsDateString()
  compareFrom?: string;

  @IsOptional()
  @IsDateString()
  compareTo?: string;

  @IsOptional()
  @IsString()
  queueId?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
