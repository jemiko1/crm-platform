import { Module } from '@nestjs/common';
import { RoleGroupsService } from './role-groups.service';
import { RoleGroupsController } from './role-groups.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoleGroupsController],
  providers: [RoleGroupsService],
  exports: [RoleGroupsService],
})
export class RoleGroupsModule {}
