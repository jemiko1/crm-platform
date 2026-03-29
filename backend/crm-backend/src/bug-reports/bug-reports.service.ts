import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GitHubIssueService } from "./github/github-issue.service";
import { CreateBugReportDto } from "./dto/create-bug-report.dto";
import { UpdateBugReportStatusDto } from "./dto/update-bug-report-status.dto";
import type { Prisma } from "@prisma/client";
import * as fs from "fs/promises";
import * as fsSyncInit from "fs";
import * as path from "path";

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name);
  private readonly videoDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GitHubIssueService,
  ) {
    this.videoDir =
      process.env.BUG_REPORT_VIDEO_DIR ||
      path.join(process.cwd(), "uploads", "bug-reports", "videos");
    fsSyncInit.mkdirSync(this.videoDir, { recursive: true });
  }

  async create(
    reporterId: string,
    dto: CreateBugReportDto,
    videoFile?: Express.Multer.File,
  ) {
    let videoPath: string | null = null;

    if (videoFile) {
      if (videoFile.size > 50 * 1024 * 1024) {
        throw new BadRequestException("Video file exceeds 50MB limit");
      }
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webm`;
      const fullPath = path.join(this.videoDir, filename);
      await fs.writeFile(fullPath, videoFile.buffer);
      videoPath = fullPath;
    }

    const report = await this.prisma.bugReport.create({
      data: {
        reporterId,
        description: dto.description,
        severity: dto.severity,
        category: dto.category ?? "BUG",
        pageUrl: dto.pageUrl,
        browserInfo: dto.browserInfo as unknown as Prisma.InputJsonValue,
        actionLog: dto.actionLog as unknown as Prisma.InputJsonValue,
        consoleLog: dto.consoleLog as unknown as Prisma.InputJsonValue,
        networkLog: dto.networkLog as unknown as Prisma.InputJsonValue,
        screenshots: (dto.screenshots ?? []) as unknown as Prisma.InputJsonValue,
        videoPath,
      },
      include: { reporter: { select: { id: true, email: true } } },
    });

    this.processAsync(report.id).catch((err) =>
      this.logger.error(`Async processing failed for ${report.id}`, err.stack),
    );

    return report;
  }

  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.bugReport.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          reporter: { select: { id: true, email: true } },
        },
      }),
      this.prisma.bugReport.count(),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const report = await this.prisma.bugReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });
    if (!report) throw new NotFoundException("Bug report not found");
    return report;
  }

  async updateStatus(id: string, dto: UpdateBugReportStatusDto) {
    await this.findOne(id);
    return this.prisma.bugReport.update({
      where: { id },
      data: { status: dto.status },
      include: {
        reporter: { select: { id: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    const report = await this.findOne(id);
    if (report.videoPath) {
      try {
        await fs.unlink(report.videoPath);
      } catch {
        this.logger.warn(`Could not delete video file: ${report.videoPath}`);
      }
    }
    await this.prisma.bugReport.delete({ where: { id } });
  }

  async retryGithub(id: string) {
    const report = await this.findOne(id);

    const reporter = report.reporter;
    const analysis = report.aiAnalysis as Record<string, unknown> | null;

    const ghResult = await this.github.createIssue({
      bugReportId: report.id,
      reporterName: reporter.email,
      reporterEmail: reporter.email,
      severity: report.severity,
      category: report.category,
      pageUrl: report.pageUrl,
      browserInfo: report.browserInfo as Record<string, unknown>,
      description: report.description,
      actionLog: report.actionLog as unknown[],
      consoleLog: report.consoleLog as unknown[],
      networkLog: report.networkLog as unknown[],
      createdAt: report.createdAt,
      analysis: analysis as any,
    });

    if (!ghResult) {
      await this.prisma.bugReport.update({
        where: { id },
        data: { githubSyncStatus: "FAILED" },
      });
      throw new BadRequestException("GitHub issue creation failed — check server logs");
    }

    return this.prisma.bugReport.update({
      where: { id },
      data: {
        githubIssueId: ghResult.issueNumber,
        githubIssueUrl: ghResult.issueUrl,
        githubSyncStatus: "SYNCED",
        status: "GITHUB_CREATED",
      },
      include: { reporter: { select: { id: true, email: true } } },
    });
  }

  private async processAsync(bugReportId: string) {
    const report = await this.prisma.bugReport.findUnique({
      where: { id: bugReportId },
      include: { reporter: { select: { id: true, email: true } } },
    });
    if (!report) return;

    // AI analysis is handled externally by Claude Code via /analyze-bugs skill
    // Backend only creates the GitHub issue with raw tester data

    const ghResult = await this.github.createIssue({
      bugReportId: report.id,
      reporterName: report.reporter.email,
      reporterEmail: report.reporter.email,
      severity: report.severity,
      category: report.category,
      pageUrl: report.pageUrl,
      browserInfo: report.browserInfo as Record<string, unknown>,
      description: report.description,
      actionLog: report.actionLog as unknown[],
      consoleLog: report.consoleLog as unknown[],
      networkLog: report.networkLog as unknown[],
      createdAt: report.createdAt,
      analysis: null,
    });

    if (ghResult) {
      await this.prisma.bugReport.update({
        where: { id: bugReportId },
        data: {
          githubIssueId: ghResult.issueNumber,
          githubIssueUrl: ghResult.issueUrl,
          githubSyncStatus: "SYNCED",
          status: "GITHUB_CREATED",
        },
      });
    } else {
      await this.prisma.bugReport.update({
        where: { id: bugReportId },
        data: { githubSyncStatus: "FAILED" },
      });
    }
  }
}
