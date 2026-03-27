import { IsArray, IsString, ArrayMinSize, MinLength } from "class-validator";

export class ReassignEmployeesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  employeeIds: string[];

  @IsString()
  @MinLength(3, { message: "Reassignment reason must be at least 3 characters" })
  reason: string;
}
