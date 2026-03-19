export type ChannelType = "WEB" | "VIBER" | "FACEBOOK" | "TELEGRAM" | "WHATSAPP";
export type ConversationStatus = "LIVE" | "CLOSED";
export type MessageDirection = "IN" | "OUT";

export interface ConversationParticipant {
  id: string;
  displayName: string;
  phone: string | null;
  externalUserId: string;
}

export interface ConversationSummary {
  id: string;
  channelType: ChannelType;
  externalConversationId: string;
  assignedUserId: string | null;
  clientId: string | null;
  status: ConversationStatus;
  lastMessageAt: string | null;
  firstResponseAt?: string | null;
  pausedOperatorId?: string | null;
  previousConversationId?: string | null;
  reopenRequestedBy?: string | null;
  reopenRequestedAt?: string | null;
  createdAt: string;
  assignedUser: { id: string; email: string; employee?: { firstName: string; lastName: string } | null } | null;
  participant: ConversationParticipant | null;
  client: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    primaryPhone: string | null;
  } | null;
  messages: {
    text: string;
    sentAt: string;
    direction: MessageDirection;
    participant: { displayName: string; phone: string | null } | null;
  }[];
}

export interface ConversationDetail {
  id: string;
  channelType: ChannelType;
  externalConversationId: string;
  assignedUserId: string | null;
  clientId: string | null;
  status: ConversationStatus;
  lastMessageAt: string | null;
  pausedOperatorId: string | null;
  previousConversationId: string | null;
  reopenRequestedBy: string | null;
  reopenRequestedAt: string | null;
  createdAt: string;
  channelAccount: { id: string; type: ChannelType; name: string };
  assignedUser: { id: string; email: string; employee?: { firstName: string; lastName: string } | null } | null;
  participant: ConversationParticipant | null;
  client: {
    id: string;
    coreId: number;
    firstName: string | null;
    lastName: string | null;
    primaryPhone: string | null;
  } | null;
  whatsappWindowOpen?: boolean;
  messages?: {
    participant: { displayName: string; phone: string | null } | null;
  }[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  participantId: string | null;
  senderUserId: string | null;
  direction: MessageDirection;
  externalMessageId: string;
  text: string;
  attachments: unknown;
  sentAt: string;
  deliveryStatus: string | null;
  createdAt: string;
  participant: {
    id: string;
    displayName: string;
    externalUserId: string;
  } | null;
  senderUser: { id: string; email: string } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AgentOption {
  id: string;
  email: string;
  name?: string;
}
