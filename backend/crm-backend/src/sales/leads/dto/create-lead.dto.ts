import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsObject,
  Min,
  IsUUID,
} from 'class-validator';

export class ContactPersonDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  role?: string;
}

export class CreateLeadDto {
  // Contact Information
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  representative?: string;

  @IsString()
  primaryPhone: string;

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
  city: string;

  @IsString()
  address: string;

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

  // Assignment (optional - defaults to current user)
  @IsUUID()
  @IsOptional()
  responsibleEmployeeId?: string;

  // Initial services (optional)
  @IsArray()
  @IsOptional()
  serviceIds?: string[];
}
