import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";

export enum ContactMethodDto {
  PHONE = "PHONE",
  EMAIL = "EMAIL",
  IN_PERSON = "IN_PERSON",
  OTHER = "OTHER",
}

export enum IncidentPriorityDto {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export class CreateIncidentDto {
  @IsInt()
  @Min(1)
  buildingId!: number; // building coreId

  @IsOptional()
  @IsInt()
  @Min(1)
  clientId?: number; // client coreId (optional - for unknown clients)

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assetIds?: number[];

  @IsEnum(ContactMethodDto)
  contactMethod!: ContactMethodDto;

  @IsString()
  incidentType!: string;

  @IsEnum(IncidentPriorityDto)
  priority!: IncidentPriorityDto;

  @IsString()
  description!: string;
}
