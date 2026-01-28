import { IsEnum } from "class-validator";

export enum IncidentStatusDto {
  CREATED = "CREATED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  WORK_ORDER_INITIATED = "WORK_ORDER_INITIATED",
}

export class UpdateIncidentStatusDto {
  @IsEnum(IncidentStatusDto)
  status!: IncidentStatusDto;
}
