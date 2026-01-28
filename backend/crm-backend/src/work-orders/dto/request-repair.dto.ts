import { IsString, IsNotEmpty } from "class-validator";

export class RequestRepairDto {
  @IsString()
  @IsNotEmpty()
  reason: string; // Reason for requesting conversion to Repair
}
