import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PhoneResolverService } from './phone-resolver.service';

@Module({
  imports: [PrismaModule],
  providers: [PhoneResolverService],
  exports: [PhoneResolverService],
})
export class PhoneResolverModule {}
