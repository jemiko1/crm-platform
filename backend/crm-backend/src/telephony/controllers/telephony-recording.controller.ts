import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RecordingAccessService } from '../recording/recording-access.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony/recordings')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class TelephonyRecordingController {
  constructor(private readonly recordingService: RecordingAccessService) {}

  // `call_recordings.own` acts as the minimum threshold — users with higher
  // scoped grants are expected to also hold `.own` per seeding convention.
  // Actual data-scope filtering (department subtree, level cap, etc) happens
  // inside RecordingAccessService.getRecordingById using DataScopeService.
  @Get(':id')
  @RequirePermission('call_recordings.own')
  @Doc({
    summary: 'Recording metadata by ID',
    ok: 'Recording URL or storage reference',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async getRecording(@Param('id') id: string, @Req() req: any) {
    const recording = await this.recordingService.getRecordingById(
      id,
      req.user.id,
      req.user.isSuperAdmin,
    );
    return {
      ...recording,
      // Tell the frontend whether the file is cached locally so it can
      // render a Play button vs a Request Recording button
      available: this.recordingService.isCachedLocally(recording),
    };
  }

  @Post(':id/fetch')
  @RequirePermission('call_recordings.own')
  @Doc({
    summary: 'Fetch a recording file from Asterisk on-demand',
    ok: 'File pulled to local cache; ready to stream',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async fetchRecording(@Param('id') id: string, @Req() req: any) {
    const { filePath, fileSize } = await this.recordingService.fetchFromAsterisk(
      id,
      req.user.id,
      req.user.isSuperAdmin,
    );
    return { ok: true, fileSize, filePath };
  }

  @Get(':id/download')
  @RequirePermission('call_recordings.own')
  @Doc({
    summary: 'Download recording file as an attachment',
    ok: 'Binary audio file with Content-Disposition: attachment',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async downloadRecording(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Res() res: Response,
  ) {
    const recording = await this.recordingService.getRecordingById(
      id,
      req.user.id,
      req.user.isSuperAdmin,
    );

    if (recording.url) {
      // URL-based recordings: redirect; browser will prompt a save dialog
      // because the redirect target should serve attachment headers
      return res.redirect(recording.url);
    }

    let info: Awaited<ReturnType<RecordingAccessService['getRecordingFileInfo']>>;
    try {
      info = await this.recordingService.getRecordingFileInfo(
        id,
        req.user.id,
        req.user.isSuperAdmin,
      );
    } catch (err: any) {
      if (err instanceof NotFoundException || err?.status === 404) {
        throw new NotFoundException(err.message ?? 'Recording file not found');
      }
      throw err;
    }

    const { filePath, fileSize, filename, contentType } = info;
    // no-store: the file lands in the user's Downloads folder immediately —
    // caching buys nothing and would prevent permission revocation from taking
    // effect on a follow-up download attempt within the cache window.
    res.status(200).set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': fileSize.toString(),
      'Cache-Control': 'no-store',
    });
    createReadStream(filePath).pipe(res);
  }

  @Get(':id/audio')
  @RequirePermission('call_recordings.own')
  @Doc({
    summary: 'Stream or redirect recording audio with range support',
    ok: 'Binary audio stream (200 full, 206 partial) or HTTP redirect',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async streamAudio(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
    @Res() res: Response,
  ) {
    const recording = await this.recordingService.getRecordingById(
      id,
      req.user.id,
      req.user.isSuperAdmin,
    );

    if (recording.url) {
      return res.redirect(recording.url);
    }

    let info: Awaited<ReturnType<RecordingAccessService['getRecordingFileInfo']>>;
    try {
      info = await this.recordingService.getRecordingFileInfo(
        id,
        req.user.id,
        req.user.isSuperAdmin,
      );
    } catch (err: any) {
      if (err instanceof NotFoundException || err?.status === 404) {
        throw new NotFoundException(err.message ?? 'Recording file not found');
      }
      throw err;
    }

    const { filePath, fileSize, filename, contentType } = info;
    const rangeHeader = req.headers.range;

    // Common headers for both 200 and 206 responses. Accept-Ranges advertises
    // support so the browser knows it can seek. Content-Length is required
    // for the HTMLMediaElement to compute duration from the byte count.
    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Accept-Ranges': 'bytes',
      // Cache recordings for 1h (immutable — files never change once written)
      'Cache-Control': 'private, max-age=3600',
    };

    if (rangeHeader) {
      // Parse "bytes=start-end" (end optional). Respond with 206 Partial Content.
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).send();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).send();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206).set({
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize.toString(),
      });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    // Full-file response. Content-Length is the key addition here — it's
    // what lets the browser show the track duration and enable the seek bar.
    res.status(200).set({
      ...baseHeaders,
      'Content-Length': fileSize.toString(),
    });
    createReadStream(filePath).pipe(res);
  }
}
