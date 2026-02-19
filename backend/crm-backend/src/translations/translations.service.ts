import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';

@Injectable()
export class TranslationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(context?: string) {
    const where = context ? { context } : {};
    return this.prisma.translation.findMany({
      where,
      orderBy: [{ context: 'asc' }, { key: 'asc' }],
    });
  }

  async findAllAsMap(): Promise<{ en: Record<string, string>; ka: Record<string, string> }> {
    const translations = await this.prisma.translation.findMany();
    const en: Record<string, string> = {};
    const ka: Record<string, string> = {};

    for (const t of translations) {
      en[t.key] = t.en;
      if (t.ka) ka[t.key] = t.ka;
    }

    return { en, ka };
  }

  async findOne(id: string) {
    const translation = await this.prisma.translation.findUnique({ where: { id } });
    if (!translation) {
      throw new NotFoundException(`Translation with ID ${id} not found`);
    }
    return translation;
  }

  async create(dto: CreateTranslationDto) {
    const existing = await this.prisma.translation.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Translation key "${dto.key}" already exists`);
    }
    return this.prisma.translation.create({ data: dto });
  }

  async update(id: string, dto: UpdateTranslationDto) {
    await this.findOne(id);
    return this.prisma.translation.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.translation.delete({ where: { id } });
  }

  async seedFromJson(enJson: Record<string, unknown>, kaJson: Record<string, unknown>) {
    const enFlat = this.flattenObject(enJson);
    const kaFlat = this.flattenObject(kaJson);

    const allKeys = new Set([...Object.keys(enFlat), ...Object.keys(kaFlat)]);
    let created = 0;
    let updated = 0;

    for (const key of allKeys) {
      const context = key.split('.')[0] || null;
      const en = enFlat[key] || key;
      const ka = kaFlat[key] || null;

      const existing = await this.prisma.translation.findUnique({ where: { key } });
      if (existing) {
        await this.prisma.translation.update({
          where: { key },
          data: { en, ka, context },
        });
        updated++;
      } else {
        await this.prisma.translation.create({
          data: { key, en, ka, context },
        });
        created++;
      }
    }

    return { created, updated, total: allKeys.size };
  }

  private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (typeof value === 'string') {
        result[fullKey] = value;
      } else if (typeof value === 'object' && value !== null) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, fullKey));
      }
    }
    return result;
  }
}
