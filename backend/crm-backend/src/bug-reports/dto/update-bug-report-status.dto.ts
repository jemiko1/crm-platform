import { IsEnum } from "class-validator";
import { BugReportStatus } from "@prisma/client";

export class UpdateBugReportStatusDto {
  @IsEnum(BugReportStatus)
  status: BugReportStatus;
}
