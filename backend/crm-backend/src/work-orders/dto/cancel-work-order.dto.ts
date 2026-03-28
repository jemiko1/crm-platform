import { IsString, MinLength } from "class-validator";

export class CancelWorkOrderDto {
  @IsString()
  @MinLength(3, { message: "Cancel reason must be at least 3 characters" })
  cancelReason: string;
}
