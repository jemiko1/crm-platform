import { IsDateString, IsOptional, IsString, IsIn } from 'class-validator';

export class QueryBreakdownDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsIn(['hour', 'day', 'weekday'])
  groupBy: 'hour' | 'day' | 'weekday';

  @IsOptional()
  @IsString()
  queueId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';
}
