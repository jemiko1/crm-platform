export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  email?: string;
  phone?: string;
  status?: string;
  jobTitle?: string;
  position?: { name: string; code: string } | null;
  department?: { name: string; code: string } | null;
}

export interface Participant {
  id: string;
  conversationId: string;
  employeeId: string;
  employee: Employee;
  role: "MEMBER" | "ADMIN";
  joinedAt: string;
  lastReadAt: string | null;
  mutedUntil: string | null;
  isArchived: boolean;
}

export interface Conversation {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  createdById: string;
  createdAt: string;
  participants: Participant[];
  unreadCount?: number;
  myParticipant?: Participant;
}

export interface MessageSender {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

export interface ReplyTo {
  id: string;
  content: string;
  sender: { id: string; firstName: string; lastName: string };
}

export interface MessageReaction {
  emoji: string;
  employeeId: string;
  employeeFirstName?: string;
  employee?: { firstName: string };
}

export type MessageStatus = "sent" | "delivered" | "seen";

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender: MessageSender;
  content: string;
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  replyToId: string | null;
  replyTo: ReplyTo | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: MessageAttachment[];
  status?: MessageStatus;
  reactions?: MessageReaction[];
}

export interface MessageAttachment {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface ActiveChat {
  conversationId: string;
  minimized: boolean;
}
