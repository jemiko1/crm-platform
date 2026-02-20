import { IsString, IsEnum, IsOptional, IsBoolean, IsObject } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WorkflowTriggerType } from "@prisma/client";

export class CreateTriggerDto {
  @ApiProperty() @IsString() name: string;

  @ApiPropertyOptional({ description: "Work order type filter (null = all types)" })
  @IsOptional()
  @IsString()
  workOrderType?: string;

  @ApiProperty({ enum: WorkflowTriggerType })
  @IsEnum(WorkflowTriggerType)
  triggerType: WorkflowTriggerType;

  @ApiProperty({ description: "Structured condition JSON based on triggerType" })
  @IsObject()
  condition: Record<string, any>;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
