import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RecordingAccessService } from '../recording/recording-access.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony/recordings')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('telephony.menu')
export class TelephonyRecordingController {
  constructor(private readonly recordingService: RecordingAccessService) {}

  @Get(':id')
  @Doc({
    summary: 'Recording metadata by ID',
    ok: 'Recording URL or storage reference',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async getRecording(@Param('id') id: string) {
    return this.recordingService.getRecordingById(id);
  }

  @Get(':id/audio')
  @Doc({
    summary: 'Stream or redirect recording audio',
    ok: 'Binary audio stream or HTTP redirect',
    notFound: true,
    params: [{ name: 'id', description: 'Recording UUID' }],
  })
  async streamAudio(@Param('id') id: string, @Res() res: Response) {
    const recording = await this.recordingService.getRecordingById(id);

    if (recording.url) {
      return res.redirect(recording.url);
    }

    try {
      const { stream, filename, contentType } =
        await this.recordingService.streamRecording(id);
      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      });
      stream.getStream().pipe(res);
    } catch (err: any) {
      if (err.status === 404) throw new NotFoundException(err.message);
      throw err;
    }
  }
}
