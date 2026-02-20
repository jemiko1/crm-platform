import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto";

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findByCode(code: string) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { code } });
    if (!template) throw new NotFoundException(`Template with code "${code}" not found`);
    return template;
  }

  async create(dto: CreateTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`Template code "${dto.code}" already exists`);
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");

    if (dto.code && dto.code !== existing.code) {
      const dup = await this.prisma.notificationTemplate.findUnique({ where: { code: dto.code } });
      if (dup) throw new ConflictException(`Template code "${dto.code}" already exists`);
    }
    return this.prisma.notificationTemplate.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");
    return this.prisma.notificationTemplate.delete({ where: { id } });
  }

  /** Replace {{variable}} placeholders in a template body/subject */
  renderTemplate(text: string, variables: Record<string, string> = {}): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  }
}
