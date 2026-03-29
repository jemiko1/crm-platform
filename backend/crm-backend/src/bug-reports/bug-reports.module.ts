import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BugReportsService } from "./bug-reports.service";
import { BugReportsController } from "./bug-reports.controller";
import { GitHubIssueService } from "./github/github-issue.service";

@Module({
  imports: [PrismaModule],
  controllers: [BugReportsController],
  providers: [BugReportsService, GitHubIssueService],
  exports: [BugReportsService],
})
export class BugReportsModule {}
