import { IsArray, IsString, IsEnum, IsOptional, ArrayMinSize } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationType } from "@prisma/client";

export class SendNotificationDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  employeeIds: string[];

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({ description: "Template code. If provided, subject/body are ignored." })
  @IsOptional()
  @IsString()
  templateCode?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;

  @ApiPropertyOptional({ description: "Variables to interpolate into template (e.g. {\"name\": \"John\"})" })
  @IsOptional()
  variables?: Record<string, string>;
}
