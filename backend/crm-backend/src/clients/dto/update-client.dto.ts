import { IsString, IsOptional } from 'class-validator';

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  idNumber?: string;

  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsString()
  @IsOptional()
  primaryPhone?: string;

  @IsString()
  @IsOptional()
  secondaryPhone?: string;
}
