import { IsArray, IsString, ArrayMinSize } from "class-validator";

export class AssignEmployeesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  employeeIds: string[]; // Employee internal IDs
}
