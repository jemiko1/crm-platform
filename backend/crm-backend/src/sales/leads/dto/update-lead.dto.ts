import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  IsUUID,
} from 'class-validator';
import { ContactPersonDto } from './create-lead.dto';

export class UpdateLeadDto {
  // Contact Information
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  representative?: string;

  @IsString()
  @IsOptional()
  primaryPhone?: string;

  @IsArray()
  @IsOptional()
  contactPersons?: ContactPersonDto[];

  @IsString()
  @IsOptional()
  associationName?: string;

  @IsUUID()
  @IsOptional()
  sourceId?: string;

  // Building Information
  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  floorsCount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  entrancesCount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  apartmentsPerFloor?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  elevatorsCount?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  entranceDoorsCount?: number;

  // Assignment
  @IsUUID()
  @IsOptional()
  responsibleEmployeeId?: string;
}
