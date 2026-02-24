import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class AdminCreateAssetDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  ip?: string;

  @IsString()
  @IsOptional()
  @IsIn(['ONLINE', 'OFFLINE', 'UNKNOWN'])
  status?: string;
}
