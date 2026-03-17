import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType, Prisma } from '@prisma/client';

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    userId: string,
    filters: {
      category?: string;
      channelType?: string;
      search?: string;
    },
  ) {
    const where: Prisma.ClientChatCannedResponseWhereInput = {
      OR: [{ isGlobal: true }, { createdById: userId }],
    };

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.channelType) {
      where.AND = [
        where.AND as Prisma.ClientChatCannedResponseWhereInput[] ?? [],
        {
          OR: [
            { channelType: filters.channelType as ClientChatChannelType },
            { channelType: null },
          ],
        },
      ].flat();
    }

    if (filters.search) {
      const term = filters.search;
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { content: { contains: term, mode: 'insensitive' } },
          ],
        },
      ] as Prisma.ClientChatCannedResponseWhereInput[];
    }

    return this.prisma.clientChatCannedResponse.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        createdBy: {
          select: { id: true, email: true },
        },
      },
    });
  }

  async create(
    userId: string,
    isSuperAdmin: boolean,
    dto: {
      title: string;
      content: string;
      category?: string;
      channelType?: string;
      isGlobal?: boolean;
      sortOrder?: number;
    },
  ) {
    if (dto.isGlobal && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only admins can create global canned responses',
      );
    }

    return this.prisma.clientChatCannedResponse.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category || null,
        channelType: (dto.channelType as ClientChatChannelType) || null,
        isGlobal: dto.isGlobal ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
  }

  async update(
    id: string,
    userId: string,
    isSuperAdmin: boolean,
    dto: {
      title?: string;
      content?: string;
      category?: string;
      channelType?: string | null;
      isGlobal?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.clientChatCannedResponse.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Canned response not found');

    if (existing.createdById !== userId && !isSuperAdmin) {
      throw new ForbiddenException(
        'You can only edit your own canned responses',
      );
    }

    if (dto.isGlobal && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only admins can make canned responses global',
      );
    }

    return this.prisma.clientChatCannedResponse.update({
      where: { id },
      data: {
        ...(dto.title != null && { title: dto.title }),
        ...(dto.content != null && { content: dto.content }),
        ...(dto.category !== undefined && { category: dto.category || null }),
        ...(dto.channelType !== undefined && {
          channelType: (dto.channelType as ClientChatChannelType) || null,
        }),
        ...(dto.isGlobal != null && { isGlobal: dto.isGlobal }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async delete(id: string, userId: string, isSuperAdmin: boolean) {
    const existing = await this.prisma.clientChatCannedResponse.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Canned response not found');

    if (existing.createdById !== userId && !isSuperAdmin) {
      throw new ForbiddenException(
        'You can only delete your own canned responses',
      );
    }

    await this.prisma.clientChatCannedResponse.delete({ where: { id } });
    return { deleted: true };
  }
}
