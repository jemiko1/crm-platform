import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordingAccessService } from '../recording/recording-access.service';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

@Injectable()
export class QualityPipelineService {
  private readonly logger = new Logger(QualityPipelineService.name);
  private readonly enabled: boolean;
  private readonly model: string;
  private readonly openai: OpenAI | null;
  private processing = false;
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recordingAccess: RecordingAccessService,
  ) {
    this.enabled = process.env.QUALITY_AI_ENABLED === 'true';
    this.model = process.env.QUALITY_AI_MODEL ?? 'gpt-4o';

    if (this.enabled && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.logger.log('Quality AI pipeline enabled');
    } else {
      this.openai = null;
      if (this.enabled) {
        this.logger.warn(
          'QUALITY_AI_ENABLED=true but OPENAI_API_KEY is missing',
        );
      }
    }
  }

  @Cron(process.env.QUALITY_AI_CRON ?? '0 */2 * * * *')
  async processPendingReviews(): Promise<void> {
    if (!this.enabled || !this.openai || this.processing) return;
    this.processing = true;

    try {
      const pending = await this.prisma.qualityReview.findMany({
        where: { status: 'PENDING' },
        take: 5,
        orderBy: { createdAt: 'asc' },
        include: {
          callSession: {
            select: {
              id: true,
              linkedId: true,
              callerNumber: true,
              direction: true,
              startAt: true,
              recordings: { take: 1, orderBy: { createdAt: 'desc' } },
            },
          },
        },
      });

      for (const review of pending) {
        await this.processReview(review);
      }
    } catch (err: any) {
      this.logger.error(`Pipeline batch error: ${err.message}`);
    } finally {
      this.processing = false;
    }
  }

  private async processReview(review: any): Promise<void> {
    const reviewId = review.id;

    try {
      await this.prisma.qualityReview.update({
        where: { id: reviewId },
        data: { status: 'PROCESSING' },
      });

      const recording = review.callSession?.recordings?.[0];
      if (!recording) {
        this.logger.warn(`Review ${reviewId}: no recording found, marking FAILED`);
        await this.markFailed(reviewId, 'No recording available');
        return;
      }

      const transcript = await this.transcribe(recording);
      if (!transcript) {
        await this.markFailed(reviewId, 'Transcription returned empty');
        return;
      }

      const rubrics = await this.prisma.qualityRubric.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const scoring = await this.scoreWithGpt(transcript, rubrics, review);

      await this.prisma.qualityReview.update({
        where: { id: reviewId },
        data: {
          status: 'DONE',
          summary: scoring.summary,
          score: scoring.score,
          flags: scoring.flags ?? [],
          tags: scoring.tags ?? [],
          transcriptRef: transcript.substring(0, 5000),
        },
      });

      this.logger.log(
        `Review ${reviewId} complete: score=${scoring.score}`,
      );
    } catch (err: any) {
      this.logger.error(`Review ${reviewId} failed: ${err.message}`);
      await this.markFailed(reviewId, err.message);
    }
  }

  private async transcribe(
    recording: { id: string; filePath: string | null; url: string | null },
  ): Promise<string | null> {
    if (!this.openai) return null;

    const filePath = this.recordingAccess.resolveFilePath(recording.filePath);
    if (!filePath) {
      this.logger.warn(`Recording ${recording.id}: no file path`);
      return null;
    }

    const file = createReadStream(filePath);
    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: file as any,
      response_format: 'text',
    });

    return typeof response === 'string' ? response : (response as any).text ?? null;
  }

  private async scoreWithGpt(
    transcript: string,
    rubrics: Array<{ name: string; weight: number; maxScore: number; description: string | null }>,
    review: any,
  ): Promise<{
    score: number;
    summary: string;
    flags: string[];
    tags: string[];
  }> {
    if (!this.openai) {
      return { score: 0, summary: 'AI not configured', flags: [], tags: [] };
    }

    const rubricText = rubrics.length > 0
      ? rubrics
          .map(
            (r) =>
              `- ${r.name} (weight: ${r.weight}%, max: ${r.maxScore}): ${r.description ?? 'No description'}`,
          )
          .join('\n')
      : '- Overall Quality (weight: 100%, max: 100): Rate the overall call quality';

    const systemPrompt = `You are a call center quality analyst. Evaluate the following call transcript and provide a quality review.

Scoring Rubric:
${rubricText}

Respond with ONLY valid JSON in this exact format:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence summary of call quality>",
  "flags": ["<any quality issues or concerns>"],
  "tags": ["<relevant tags like 'polite', 'efficient', 'escalation', etc>"]
}`;

    const callContext = [
      review.callSession?.direction === 'IN' ? 'Inbound call' : 'Outbound call',
      `Caller: ${review.callSession?.callerNumber ?? 'unknown'}`,
    ].join('. ');

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${callContext}\n\nTranscript:\n${transcript.substring(0, 8000)}`,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);

    return {
      score: Math.min(100, Math.max(0, Math.round(parsed.score ?? 0))),
      summary: parsed.summary ?? '',
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  }

  private async markFailed(reviewId: string, reason: string): Promise<void> {
    await this.prisma.qualityReview.update({
      where: { id: reviewId },
      data: {
        status: 'FAILED',
        summary: `Pipeline error: ${reason}`,
      },
    });
  }
}
