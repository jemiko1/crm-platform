import { IsEnum } from 'class-validator';
import { ClientChatStatus } from '@prisma/client';

export class ChangeStatusDto {
  @IsEnum(ClientChatStatus)
  status: ClientChatStatus;
}
