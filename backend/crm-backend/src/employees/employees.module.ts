import { Module, forwardRef } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TelephonyModule } from '../telephony/telephony.module';

@Module({
  // TelephonyModule is wrapped in forwardRef — TelephonyModule does not
  // import EmployeesModule today, but the gateway/state-manager touches
  // User ↔ Employee join fields and future circular imports would break
  // the boot order. Cheap insurance.
  imports: [PrismaModule, forwardRef(() => TelephonyModule)],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
