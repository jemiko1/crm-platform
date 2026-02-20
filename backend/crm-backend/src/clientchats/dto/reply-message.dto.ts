import { IsString, MinLength } from 'class-validator';

export class ReplyMessageDto {
  @IsString()
  @MinLength(1)
  text: string;
}
