import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, IsArray } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WorkflowActionType } from "@prisma/client";

export class CreateTriggerActionDto {
  @ApiProperty({ enum: WorkflowActionType })
  @IsEnum(WorkflowActionType)
  actionType: WorkflowActionType;

  @ApiProperty({ description: "POSITION, ASSIGNED_EMPLOYEES, or RESPONSIBLE" })
  @IsString()
  targetType: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  targetPositionIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() templateCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customSubject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customBody?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
