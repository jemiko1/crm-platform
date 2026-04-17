import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  StreamableFile,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createReadStream, existsSync, statSync, mkdirSync } from 'fs';
import { basename, dirname, isAbsolute, normalize, resolve } from 'path';
import { spawn } from 'child_process';

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

  /**
   * Resolves a recording to its on-disk metadata (path, size, content type).
   * Throws NotFoundException if the recording row is missing, URL-based, or
   * the file is not on disk.
   *
   * The controller uses this to set Content-Length, Accept-Ranges, and
   * optionally respond to HTTP Range requests — required for HTML <audio>
   * to show duration and support seeking.
   */
  async getRecordingFileInfo(recordingId: string): Promise<{
    filePath: string;
    fileSize: number;
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

    const stat = statSync(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'wav';
    const contentType =
      ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : 'audio/wav';
    const filename = `recording-${recording.id}.${ext}`;

    return { filePath, fileSize: stat.size, filename, contentType };
  }

  /**
   * @deprecated Prefer getRecordingFileInfo + controller-side range handling.
   * Kept for backward compatibility — still works as a simple full-file stream
   * but does NOT set Content-Length, so browsers can't display duration.
   */
  async streamRecording(recordingId: string): Promise<{
    stream: StreamableFile;
    filename: string;
    contentType: string;
  }> {
    const info = await this.getRecordingFileInfo(recordingId);
    const stream = new StreamableFile(createReadStream(info.filePath));
    return { stream, filename: info.filename, contentType: info.contentType };
  }

  /**
   * Returns true if the recording file is currently cached on local disk.
   * Used by the call-logs API to tell the frontend whether to render a
   * Play button or a "Request Recording" button.
   */
  isCachedLocally(recording: { filePath: string | null; url: string | null }): boolean {
    if (recording.url) return true; // external URL is always "available"
    const local = this.resolveFilePath(recording.filePath);
    return !!(local && existsSync(local));
  }

  /**
   * On-demand fetch: pulls a single recording file from Asterisk (where
   * Asterisk wrote it) to the VM's local cache. Operators click a
   * "Request Recording" button in the UI to trigger this — we don't
   * bulk-sync everything because operators only need a small percentage
   * of recordings in practice.
   *
   * Uses the SSH key that the AMI tunnel already uses:
   *   C:\Users\Administrator\.ssh\id_rsa_asterisk  (on the VM)
   *
   * Env vars:
   *   RECORDING_SSH_KEY   — path to SSH private key (defaults to VM path)
   *   RECORDING_SSH_USER  — SSH user on Asterisk (default "root")
   *   RECORDING_SSH_HOST  — Asterisk hostname/IP (default "5.10.34.153")
   *   SCP_EXECUTABLE      — scp binary (default "scp" — resolved via PATH)
   *
   * The download happens synchronously; resolves when done or rejects on
   * error/timeout (60s).
   */
  async fetchFromAsterisk(recordingId: string): Promise<{ filePath: string; fileSize: number }> {
    const recording = await this.getRecordingById(recordingId);

    if (recording.url) {
      throw new InternalServerErrorException(
        'Recording is URL-based; no fetch needed',
      );
    }
    if (!recording.filePath) {
      throw new NotFoundException('Recording has no filePath');
    }

    const localPath = this.resolveFilePath(recording.filePath);
    if (!localPath) {
      throw new NotFoundException('Could not resolve local path for recording');
    }

    // Already cached? Nothing to do.
    if (existsSync(localPath)) {
      const stat = statSync(localPath);
      return { filePath: localPath, fileSize: stat.size };
    }

    // Ensure parent directory exists
    const localDir = dirname(localPath);
    mkdirSync(localDir, { recursive: true });

    // Build the remote path. Recording.filePath is the Asterisk-side path.
    const remotePath = recording.filePath.replace(/\\/g, '/');
    const sshKey =
      process.env.RECORDING_SSH_KEY ??
      'C:\\Users\\Administrator\\.ssh\\id_rsa_asterisk';
    const sshUser = process.env.RECORDING_SSH_USER ?? 'root';
    const sshHost = process.env.RECORDING_SSH_HOST ?? '5.10.34.153';
    const scpBin = process.env.SCP_EXECUTABLE ?? 'scp';

    const args = [
      '-i', sshKey,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=15',
      `${sshUser}@${sshHost}:${remotePath}`,
      localPath,
    ];

    this.logger.log(
      `Fetching recording ${recordingId}: ${sshUser}@${sshHost}:${remotePath} -> ${localPath}`,
    );

    return new Promise((resolveP, reject) => {
      const proc = spawn(scpBin, args, { windowsHide: true });
      let stderr = '';
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new InternalServerErrorException('SCP timed out after 60s'));
      }, 60_000);

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        this.logger.error(`SCP spawn failed: ${err.message}`);
        reject(
          new InternalServerErrorException(
            `Failed to start SCP process: ${err.message}`,
          ),
        );
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          this.logger.error(
            `SCP exited with code ${code} for ${recordingId}: ${stderr}`,
          );
          reject(
            new InternalServerErrorException(
              `SCP failed (exit ${code}): ${stderr.trim() || 'unknown error'}`,
            ),
          );
          return;
        }
        if (!existsSync(localPath)) {
          reject(
            new InternalServerErrorException(
              'SCP reported success but local file is missing',
            ),
          );
          return;
        }
        const stat = statSync(localPath);
        this.logger.log(
          `Fetched recording ${recordingId}: ${stat.size} bytes to ${localPath}`,
        );
        resolveP({ filePath: localPath, fileSize: stat.size });
      });
    });
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
