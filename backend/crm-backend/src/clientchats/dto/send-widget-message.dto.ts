import { IsString, MinLength } from 'class-validator';

export class SendWidgetMessageDto {
  @IsString()
  @MinLength(1)
  text: string;
}
