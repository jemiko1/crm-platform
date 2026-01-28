import { IsString, IsOptional, IsUUID } from 'class-validator';

export class DeletePositionDto {
  @IsString()
  @IsUUID('4')
  @IsOptional()
  replacementPositionId?: string; // Optional replacement position ID
}
