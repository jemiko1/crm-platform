import { IsString, IsNotEmpty } from 'class-validator';

export class ReassignAndDeleteDto {
  @IsString()
  @IsNotEmpty()
  targetItemId: string; // The list item ID to reassign records to
}
