import { PartialType } from '@nestjs/mapped-types';
import { CreateListItemDto } from './create-list-item.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateListItemDto extends PartialType(CreateListItemDto) {
  @IsOptional()
  @IsString()
  categoryId?: string;
}
