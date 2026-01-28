import { Module } from '@nestjs/common';
import { SystemListsController } from './system-lists.controller';
import { SystemListsService } from './system-lists.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [SystemListsController],
  providers: [SystemListsService],
  exports: [SystemListsService],
})
export class SystemListsModule {}
