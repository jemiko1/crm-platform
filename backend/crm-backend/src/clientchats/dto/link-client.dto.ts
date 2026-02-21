import { IsString } from 'class-validator';

export class LinkClientDto {
  @IsString()
  clientId: string;
}
