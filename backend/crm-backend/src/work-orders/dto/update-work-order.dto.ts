import { IsString, IsOptional } from "class-validator";

export class UpdateWorkOrderDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Workflow comments
  @IsString()
  @IsOptional()
  techEmployeeComment?: string;

  @IsString()
  @IsOptional()
  techHeadComment?: string;

  @IsString()
  @IsOptional()
  cancelReason?: string;
}
