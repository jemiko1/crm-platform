import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { NotificationService } from "./notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmailSenderService } from "./email.service";
import { SmsSenderService } from "./sms.service";
import { NotificationTemplatesService } from "./notification-templates.service";
import { NotificationLogService } from "./notification-log.service";

describe("NotificationService", () => {
  let service: NotificationService;
  let prisma: {
    employee: { findMany: jest.Mock };
    smsConfig: { findFirst: jest.Mock };
  };
  let templates: { findByCode: jest.Mock; renderTemplate: jest.Mock };
  let emailSender: { sendEmail: jest.Mock };
  let smsSender: { sendSms: jest.Mock };
  let logs: { create: jest.Mock };

  beforeEach(async () => {
    prisma = {
      employee: { findMany: jest.fn() },
      smsConfig: { findFirst: jest.fn().mockResolvedValue({ maxBatchRecipients: 50 }) },
    };
    templates = {
      findByCode: jest.fn(),
      renderTemplate: jest.fn((t: string) => t),
    };
    emailSender = { sendEmail: jest.fn().mockResolvedValue({ success: true }) };
    smsSender = { sendSms: jest.fn().mockResolvedValue({ success: true }) };
    logs = { create: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailSenderService, useValue: emailSender },
        { provide: SmsSenderService, useValue: smsSender },
        { provide: NotificationTemplatesService, useValue: templates },
        { provide: NotificationLogService, useValue: logs },
      ],
    }).compile();
    service = module.get(NotificationService);
  });

  describe("send", () => {
    it("should throw BadRequestException when body is empty and no template", async () => {
      await expect(
        service.send({
          employeeIds: ["e1"],
          type: NotificationType.EMAIL,
          subject: "",
          body: "",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when SMS recipients exceed batch limit", async () => {
      prisma.smsConfig.findFirst.mockResolvedValue({ maxBatchRecipients: 2 });
      const ids = ["a", "b", "c"];
      await expect(
        service.send({
          employeeIds: ids,
          type: NotificationType.SMS,
          body: "x",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should send email when body is provided and employee has email", async () => {
      prisma.employee.findMany.mockResolvedValue([
        { id: "e1", firstName: "A", lastName: "B", email: "a@b.c", phone: null },
      ]);
      const res = await service.send({
        employeeIds: ["e1"],
        type: NotificationType.EMAIL,
        subject: "S",
        body: "Hello",
      });
      expect(res.sent).toBe(1);
      expect(emailSender.sendEmail).toHaveBeenCalled();
    });
  });
});
