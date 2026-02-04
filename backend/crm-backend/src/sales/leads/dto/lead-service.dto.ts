import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  IsUUID,
  IsObject,
} from 'class-validator';

export class AddLeadServiceDto {
  @IsUUID()
  serviceId: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number = 1;

  @IsNumber()
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @IsOptional()
  oneTimePrice?: number;

  @IsObject()
  @IsOptional()
  customParams?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateLeadServiceDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @IsOptional()
  oneTimePrice?: number;

  @IsObject()
  @IsOptional()
  customParams?: Record<string, any>;

  @IsString()
  @IsOptional()
  notes?: string;
}
