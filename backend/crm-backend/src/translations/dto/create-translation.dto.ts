import { IsString, IsOptional } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  key: string;

  @IsString()
  en: string;

  @IsOptional()
  @IsString()
  ka?: string;

  @IsOptional()
  @IsString()
  context?: string;
}
