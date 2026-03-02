import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createReadStream, existsSync } from 'fs';
import { join, isAbsolute } from 'path';

@Injectable()
export class RecordingAccessService {
  private readonly logger = new Logger(RecordingAccessService.name);
  private readonly basePath: string;

  constructor(private readonly prisma: PrismaService) {
    this.basePath =
      process.env.RECORDING_BASE_PATH ?? '/var/spool/asterisk/monitor';
  }

  async getRecordingById(recordingId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      include: {
        callSession: {
          select: {
            id: true,
            linkedId: true,
            callerNumber: true,
            startAt: true,
            disposition: true,
          },
        },
      },
    });

    if (!recording) throw new NotFoundException('Recording not found');
    return recording;
  }

  async streamRecording(recordingId: string): Promise<{
    stream: StreamableFile;
    filename: string;
    contentType: string;
  }> {
    const recording = await this.getRecordingById(recordingId);

    if (recording.url) {
      throw new Error(
        'Recording is URL-based; redirect the client to recording.url instead',
      );
    }

    const filePath = this.resolveFilePath(recording.filePath);
    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('Recording file not found on disk');
    }

    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'wav';
    const contentType =
      ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
    const filename = `recording-${recording.id}.${ext}`;

    const stream = new StreamableFile(createReadStream(filePath));
    return { stream, filename, contentType };
  }

  resolveFilePath(filePath: string | null): string | null {
    if (!filePath) return null;
    if (isAbsolute(filePath)) return filePath;
    return join(this.basePath, filePath);
  }
}
