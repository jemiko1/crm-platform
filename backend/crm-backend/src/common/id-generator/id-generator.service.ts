import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type ExternalEntityKey = "building" | "client" | "asset";

/**
 * DEV/TEST fallback: generates sequential "core-like" IDs locally.
 *
 * When the real core system is connected (CORE_INTEGRATION_ENABLED=true),
 * manual ID generation risks collisions with real core IDs.
 * Seed ExternalIdCounter.nextId above the core system's current max before
 * enabling integration, or stop using manual creation entirely.
 */
@Injectable()
export class IdGeneratorService {
  private readonly logger = new Logger(IdGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async next(entity: ExternalEntityKey): Promise<number> {
    if (
      String(process.env.CORE_INTEGRATION_ENABLED ?? "").toLowerCase() ===
      "true"
    ) {
      this.logger.warn(
        `Local coreId generated for "${entity}" while CORE_INTEGRATION_ENABLED=true. ` +
          `This may collide with real core IDs. Prefer using the core webhook for data sync.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.externalIdCounter.upsert({
        where: { entity },
        create: { entity, nextId: 1 },
        update: {},
      });

      const idToUse = counter.nextId;

      await tx.externalIdCounter.update({
        where: { entity },
        data: { nextId: { increment: 1 } },
      });

      return idToUse;
    });
  }
}
