import {
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createReadStream, existsSync } from 'fs';
import { basename, isAbsolute, join, normalize, resolve } from 'path';

/**
 * Asterisk's default recording directory — absolute paths from AMI/CDR ingestion
 * typically start with this prefix (Linux).
 */
const ASTERISK_LINUX_PREFIX = '/var/spool/asterisk/monitor';

@Injectable()
export class RecordingAccessService {
  private readonly logger = new Logger(RecordingAccessService.name);
  private readonly basePath: string;

  constructor(private readonly prisma: PrismaService) {
    // Default differs per platform:
    // - Linux dev/CI: /var/spool/asterisk/monitor (matches Asterisk default)
    // - Windows VM production: C:\recordings (set via env var on VM)
    this.basePath = normalize(
      process.env.RECORDING_BASE_PATH ?? '/var/spool/asterisk/monitor',
    );
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

    // Asterisk (running on Linux) reports absolute paths like
    // /var/spool/asterisk/monitor/2026/04/17/recording.wav — but the CRM
    // backend may be running on Windows (VM) where files are mirrored to
    // C:\recordings\. Strip the known Linux prefix and remap onto basePath.
    const normalizedInput = filePath.replace(/\\/g, '/');
    let relative: string;

    if (normalizedInput.startsWith(ASTERISK_LINUX_PREFIX)) {
      // Known Asterisk root → strip and use remainder relative to basePath
      relative = normalizedInput.slice(ASTERISK_LINUX_PREFIX.length).replace(/^\/+/, '');
    } else if (isAbsolute(filePath)) {
      // Other absolute path — try it as-is first, fall back to basename
      const asIs = normalize(filePath);
      if (existsSync(asIs)) return asIs;
      relative = basename(filePath);
    } else {
      // Already relative
      relative = normalizedInput.replace(/^\/+/, '');
    }

    const resolved = resolve(this.basePath, relative);
    const normalizedBase = normalize(this.basePath);

    // Prevent path traversal — ensure we stay under basePath
    if (!resolved.startsWith(normalizedBase)) {
      this.logger.warn(`Path traversal attempt blocked: ${filePath}`);
      return null;
    }

    return resolved;
  }
}
