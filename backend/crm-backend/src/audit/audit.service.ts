import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type AuditAction = "CREATE" | "UPDATE" | "DELETE";
type AuditEntity = "BUILDING" | "CLIENT" | "ASSET" | "WORK_ORDER" | "USER";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: AuditAction;
    entity: AuditEntity;
    entityKey: string;
    req?: any;
    payload?: any;
  }) {
    const req = params.req;
    const user = req?.user;

    await this.prisma.auditLog.create({
      data: {
        action: params.action as any,
        entity: params.entity as any,
        entityKey: params.entityKey,
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        ip: req?.ip ?? null,
        userAgent: req?.headers?.["user-agent"] ?? null,
        payload: params.payload ?? null,
      },
    });
  }
}
