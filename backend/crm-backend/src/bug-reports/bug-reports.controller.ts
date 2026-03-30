import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { BugReportsService } from "./bug-reports.service";
import { CreateBugReportDto } from "./dto/create-bug-report.dto";
import { UpdateBugReportStatusDto } from "./dto/update-bug-report-status.dto";
import { PaginationDto } from "../common/dto/pagination.dto";
import type { Response } from "express";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import * as path from "path";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";

@ApiTags("Bug Reports")
@Controller("v1/bug-reports")
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class BugReportsController {
  constructor(private readonly bugReportsService: BugReportsService) {}

  @Post()
  @RequirePermission("bug_reports.create")
  @UseInterceptors(
    FileInterceptor("video", {
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype === "video/webm" || file.mimetype === "video/mp4") {
          cb(null, true);
        } else {
          cb(new BadRequestException("Only webm/mp4 video files are allowed"), false);
        }
      },
    }),
  )
  async create(
    @Req() req: any,
    @Body("data") rawData: string,
    @UploadedFile() video?: Express.Multer.File,
  ) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      throw new BadRequestException("Invalid JSON in 'data' field");
    }

    const dto = plainToInstance(CreateBugReportDto, parsed);
    try {
      await validateOrReject(dto, { whitelist: true, forbidNonWhitelisted: true });
    } catch (errors) {
      throw new BadRequestException(errors);
    }

    const reporterId: string = req.user.id ?? req.user.sub;
    return this.bugReportsService.create(reporterId, dto, video);
  }

  @Get()
  @RequirePermission("bug_reports.read")
  findAll(@Query() pagination?: PaginationDto) {
    return this.bugReportsService.findAll(
      pagination?.page ?? 1,
      pagination?.pageSize ?? 20,
    );
  }

  @Get(":id")
  @RequirePermission("bug_reports.read")
  findOne(@Param("id") id: string) {
    return this.bugReportsService.findOne(id);
  }

  @Get(":id/video")
  @RequirePermission("bug_reports.read")
  async serveVideo(@Param("id") id: string, @Res() res: Response) {
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

    const contentType = resolved.endsWith(".mp4") ? "video/mp4" : "video/webm";
    const ext = resolved.endsWith(".mp4") ? "mp4" : "webm";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="bug-${id.slice(0, 8)}.${ext}"`);
    createReadStream(resolved).pipe(res);
  }

  @Patch(":id/status")
  @RequirePermission("bug_reports.update")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateBugReportStatusDto,
  ) {
    return this.bugReportsService.updateStatus(id, dto);
  }

  @Delete(":id")
  @RequirePermission("bug_reports.delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.bugReportsService.remove(id);
  }

  @Post(":id/retry-github")
  @RequirePermission("bug_reports.update")
  retryGithub(@Param("id") id: string) {
    return this.bugReportsService.retryGithub(id);
  }
}
