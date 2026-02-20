import { IsOptional, IsString, IsEmail } from 'class-validator';

export class StartChatDto {
  @IsOptional()
  @IsString()
  visitorId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
