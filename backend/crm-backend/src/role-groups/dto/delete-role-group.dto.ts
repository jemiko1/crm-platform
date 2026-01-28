import { IsString, IsOptional, IsUUID } from 'class-validator';

export class DeleteRoleGroupDto {
  @IsString()
  @IsUUID('4')
  @IsOptional()
  replacementRoleGroupId?: string; // Optional replacement role group ID
}
