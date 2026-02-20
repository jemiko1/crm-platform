import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, QualityReviewStatus } from '@prisma/client';
import { QueryReviewsDto, UpdateReviewDto } from '../dto/query-reviews.dto';

@Injectable()
export class TelephonyQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllReviews(query: QueryReviewsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.QualityReviewWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.agentId) {
      where.callSession = { assignedUserId: query.agentId };
    }
    if (query.minScore !== undefined || query.maxScore !== undefined) {
      where.score = {};
      if (query.minScore !== undefined) where.score.gte = query.minScore;
      if (query.maxScore !== undefined) where.score.lte = query.maxScore;
    }

    const [data, total] = await Promise.all([
      this.prisma.qualityReview.findMany({
        where,
        include: {
          callSession: {
            select: {
              id: true,
              callerNumber: true,
              direction: true,
              startAt: true,
              endAt: true,
              disposition: true,
              assignedUserId: true,
              assignedUser: { select: { id: true, email: true } },
              queue: { select: { id: true, name: true } },
            },
          },
          reviewer: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.qualityReview.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOneReview(id: string) {
    const review = await this.prisma.qualityReview.findUnique({
      where: { id },
      include: {
        callSession: {
          include: {
            callMetrics: true,
            recordings: true,
            queue: { select: { id: true, name: true } },
            assignedUser: { select: { id: true, email: true } },
          },
        },
        reviewer: { select: { id: true, email: true } },
      },
    });

    if (!review) throw new NotFoundException('Quality review not found');
    return review;
  }

  async updateReview(id: string, dto: UpdateReviewDto, reviewerUserId?: string) {
    const review = await this.prisma.qualityReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Quality review not found');

    return this.prisma.qualityReview.update({
      where: { id },
      data: {
        summary: dto.summary ?? undefined,
        score: dto.score ?? undefined,
        flags: dto.flags !== undefined ? (dto.flags as Prisma.InputJsonValue) : undefined,
        tags: dto.tags !== undefined ? (dto.tags as unknown as Prisma.InputJsonValue) : undefined,
        status: dto.score !== undefined ? QualityReviewStatus.DONE : undefined,
        reviewerUserId: reviewerUserId ?? undefined,
      },
    });
  }

  async findAllRubrics() {
    return this.prisma.qualityRubric.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertRubric(data: {
    id?: string;
    name: string;
    description?: string;
    weight: number;
    maxScore?: number;
  }) {
    if (data.id) {
      return this.prisma.qualityRubric.update({
        where: { id: data.id },
        data: {
          name: data.name,
          description: data.description,
          weight: data.weight,
          maxScore: data.maxScore,
        },
      });
    }

    return this.prisma.qualityRubric.create({
      data: {
        name: data.name,
        description: data.description,
        weight: data.weight,
        maxScore: data.maxScore ?? 100,
      },
    });
  }
}
