import { IsString, IsOptional, IsBoolean, ValidateIf } from 'class-validator';

export class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsString()
  nameKa?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ValidateIf((o) => o.parentId !== null)
  @IsString()
  @IsOptional()
  parentId?: string | null; // null = make root department

  @ValidateIf((o) => o.headId !== null)
  @IsString()
  @IsOptional()
  headId?: string | null; // null = remove head

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
