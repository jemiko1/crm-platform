import { IsString, MinLength } from 'class-validator';

export class CreateTestWhatsAppConversationDto {
  @IsString()
  @MinLength(10, { message: 'Phone number must have at least 10 digits (e.g. 995555123456)' })
  phoneNumber: string;
}
