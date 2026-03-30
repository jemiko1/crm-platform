import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BugReportsService } from "./bug-reports.service";
import { BugReportsController } from "./bug-reports.controller";
import { BugReportsPublicController } from "./bug-reports-public.controller";
import { GitHubIssueService } from "./github/github-issue.service";

@Module({
  imports: [PrismaModule],
  controllers: [BugReportsController, BugReportsPublicController],
  providers: [BugReportsService, GitHubIssueService],
  exports: [BugReportsService],
})
export class BugReportsModule {}
