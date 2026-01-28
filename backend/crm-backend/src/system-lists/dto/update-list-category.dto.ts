import { PartialType } from '@nestjs/mapped-types';
import { CreateListCategoryDto } from './create-list-category.dto';

export class UpdateListCategoryDto extends PartialType(CreateListCategoryDto) {}
