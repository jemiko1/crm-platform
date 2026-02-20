import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EmailConfigService } from "./email-config.service";
import { SmsConfigService } from "./sms-config.service";
import { EmailSenderService } from "./email.service";
import { SmsSenderService } from "./sms.service";
import { NotificationTemplatesService } from "./notification-templates.service";
import { NotificationLogService } from "./notification-log.service";
import { NotificationService } from "./notification.service";

@Module({
  imports: [PrismaModule],
  providers: [
    EmailConfigService,
    SmsConfigService,
    EmailSenderService,
    SmsSenderService,
    NotificationTemplatesService,
    NotificationLogService,
    NotificationService,
  ],
  exports: [
    EmailConfigService,
    SmsConfigService,
    EmailSenderService,
    SmsSenderService,
    NotificationTemplatesService,
    NotificationLogService,
    NotificationService,
  ],
})
export class NotificationsModule {}
