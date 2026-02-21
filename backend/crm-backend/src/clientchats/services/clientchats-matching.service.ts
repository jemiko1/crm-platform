import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClientChatParticipant,
  ClientChatConversation,
} from '@prisma/client';

@Injectable()
export class ClientChatsMatchingService {
  private readonly logger = new Logger(ClientChatsMatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to auto-match a participant to an existing CRM Client by phone or email.
   * Updates both the participant's mappedClientId and the conversation's clientId.
   */
  async autoMatch(
    participant: ClientChatParticipant,
    conversation: ClientChatConversation,
  ) {
    if (participant.mappedClientId || conversation.clientId) return;

    const client = await this.findClientByContact(
      participant.phone,
      participant.email,
    );
    if (!client) return;

    this.logger.log(
      `Auto-matched participant ${participant.id} to client ${client.id}`,
    );

    await this.prisma.$transaction([
      this.prisma.clientChatParticipant.update({
        where: { id: participant.id },
        data: { mappedClientId: client.id },
      }),
      this.prisma.clientChatConversation.update({
        where: { id: conversation.id },
        data: { clientId: client.id },
      }),
    ]);
  }

  async findClientByContact(phone?: string | null, email?: string | null) {
    if (!phone && !email) return null;

    if (phone) {
      const normalised = phone.replace(/[\s\-()]/g, '');
      const byPhone = await this.prisma.client.findFirst({
        where: {
          OR: [
            { primaryPhone: { contains: normalised } },
            { secondaryPhone: { contains: normalised } },
          ],
          isActive: true,
        },
      });
      if (byPhone) return byPhone;
    }

    // No email column on Client model, so email matching is N/A for now.
    // When added, extend here.

    return null;
  }
}
