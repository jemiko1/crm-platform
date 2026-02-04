import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  content: string;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean = false;
}

export class UpdateLeadNoteDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}
