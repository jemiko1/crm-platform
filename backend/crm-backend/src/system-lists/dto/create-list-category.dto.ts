import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class CreateListCategoryDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tableName?: string;

  @IsOptional()
  @IsString()
  fieldName?: string;

  @IsOptional()
  @IsBoolean()
  isUserEditable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
