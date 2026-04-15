import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ClientChatStatus } from '@prisma/client';

export class ConversationQueryDto {
  @IsOptional()
  @IsString()
  channelType?: string;

  @IsOptional()
  @IsEnum(ClientChatStatus)
  status?: ClientChatStatus;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  /** Show conversations assigned to this user OR unassigned (for queue members) */
  @IsOptional()
  @IsString()
  assignedUserIdOrUnassigned?: string;

  /** Filter by assigned operator (for managers filtering by specific agent) */
  @IsOptional()
  @IsString()
  filterAssignedTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
