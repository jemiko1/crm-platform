import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type ExternalEntityKey = "building" | "client" | "asset";

@Injectable()
export class IdGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async next(entity: ExternalEntityKey): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // Create counter if missing
      const counter = await tx.externalIdCounter.upsert({
        where: { entity },
        create: { entity, nextId: 1 },
        update: {},
      });

      const idToUse = counter.nextId;

      // increment for next call
      await tx.externalIdCounter.update({
        where: { entity },
        data: { nextId: { increment: 1 } },
      });

      return idToUse;
    });
  }
}
