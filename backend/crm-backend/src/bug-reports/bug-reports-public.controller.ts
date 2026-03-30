import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  NotFoundException,
  ForbiddenException,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { BugReportsService } from "./bug-reports.service";
import type { Response, Request } from "express";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import * as path from "path";

@SkipThrottle()
@Controller("public/bug-reports")
export class BugReportsPublicController {
  private readonly logger = new Logger(BugReportsPublicController.name);

  constructor(private readonly bugReportsService: BugReportsService) {}

  @Get(":id/video")
  async serveVideo(
    @Param("id") id: string,
    @Query("token") token: string,
    @Res() res: Response,
  ) {
    if (!token || !this.bugReportsService.verifyVideoToken(id, token)) {
      throw new ForbiddenException("Invalid or expired video token");
    }

    const report = await this.bugReportsService.findOne(id);
    if (!report.videoPath) {
      throw new NotFoundException("Video not found");
    }

    const videoDir = this.bugReportsService.getVideoDir();
    const resolved = path.resolve(report.videoPath);
    if (!resolved.startsWith(path.resolve(videoDir))) {
      throw new ForbiddenException("Invalid video path");
    }

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(resolved);
    } catch {
      throw new NotFoundException("Video file not found on disk");
    }

    const contentType = resolved.endsWith(".mp4")
      ? "video/mp4"
      : "video/webm";
    const ext = resolved.endsWith(".mp4") ? "mp4" : "webm";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="bug-${id.slice(0, 8)}.${ext}"`,
    );
    createReadStream(resolved).pipe(res);
  }

  @Post("video-cleanup")
  @HttpCode(HttpStatus.OK)
  async cleanupVideo(
    @Req() req: Request,
    @Body() body: { githubIssueId: number },
  ) {
    const secret = req.headers["x-cleanup-secret"];
    const expected = process.env.BUG_REPORT_CLEANUP_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException("Invalid cleanup secret");
    }

    const deleted =
      await this.bugReportsService.cleanupVideoByGithubIssue(
        body.githubIssueId,
      );
    return { success: true, deleted };
  }
}
