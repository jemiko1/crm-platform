import { IsString, IsOptional } from 'class-validator';

export class UpdateTranslationDto {
  @IsOptional()
  @IsString()
  en?: string;

  @IsOptional()
  @IsString()
  ka?: string;

  @IsOptional()
  @IsString()
  context?: string;
}
