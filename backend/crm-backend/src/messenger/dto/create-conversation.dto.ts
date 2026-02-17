import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @IsEnum(ConversationType)
  type!: ConversationType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantIds!: string[];
}
