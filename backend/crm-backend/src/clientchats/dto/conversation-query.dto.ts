import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ClientChatChannelType, ClientChatStatus } from '@prisma/client';

export class ConversationQueryDto {
  @IsOptional()
  @IsEnum(ClientChatChannelType)
  channelType?: ClientChatChannelType;

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
  limit?: number;
}
