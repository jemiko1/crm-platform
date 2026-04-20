# DATABASE_SCHEMA.md — Database & Data Model Bible

> **ORM**: Prisma 7.x
> **Schema file**: `backend/crm-backend/prisma/schema.prisma` (2125 lines)
> **Database**: PostgreSQL 17 (production VM 192.168.65.110, port 5432) / PostgreSQL 16 (local dev Docker `crm-prod-db`, port 5433)
> **Last Updated**: 2026-04-20 (telephony audit — PRs #249–#268)

---

## 1. Tables / Models

### Core CRM

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Building** | Physical buildings managed by the CRM | `id` (UUID), `name`, `address`, `city`, `coreId` (unique int from external system), `isActive`, `deletedAt` |
| **Client** | Customers associated with buildings | `id` (UUID), `coreId` (unique int), `firstName`, `lastName`, `idNumber`, `paymentId`, `primaryPhone`, `secondaryPhone`, `isActive` |
| **ClientBuilding** | Many-to-many join: clients ↔ buildings | Composite PK `[clientId, buildingId]` |
| **Asset** | Building devices (elevators, intercoms, etc.) | `id` (UUID), `buildingId` (FK), `type`, `name`, `ip`, `status` (DeviceStatus enum), `coreId` (unique int), `isActive` |

### Work Orders

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **WorkOrder** | Service requests for buildings | `id` (UUID), `buildingId`, `assetId?`, `status` (WorkOrderStatus), `title`, `type` (WorkOrderType), `workOrderNumber` (autoincrement), `deadline?`, `amountGel?`, `parentWorkOrderId?` |
| **WorkOrderAssignment** | Employees assigned to work orders | `workOrderId`, `employeeId`, `assignedBy?` |
| **WorkOrderAsset** | Many-to-many: work orders ↔ assets | Composite PK `[workOrderId, assetId]` |
| **WorkOrderProductUsage** | Products consumed by work orders | `workOrderId`, `productId`, `quantity`, `batchId?`, `isApproved`, `approvedBy?` |
| **DeactivatedDevice** | Devices removed during work orders | `workOrderId`, `productId`, `quantity`, `isWorkingCondition`, `transferredToStock` |
| **WorkOrderNotification** | Per-employee work order notifications | Unique `[workOrderId, employeeId]`, `notifiedAt?`, `readAt?` |
| **WorkOrderActivityLog** | Audit trail for work order actions | `workOrderId`, `performedById?`, `action`, `category`, `title`, `description`, `metadata` (JSON) |

### Incidents

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Incident** | Reported problems/issues | `id`, `incidentNumber` (unique, format INC-YYYY-####), `buildingId`, `clientId?` (nullable), `contactMethod`, `incidentType`, `priority`, `status`, `reportedById?` |
| **IncidentAsset** | Many-to-many: incidents ↔ assets | Composite PK `[incidentId, assetId]` |

### Inventory

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **InventoryProduct** | Products in warehouse | `id`, `sku` (unique), `name`, `category` (ProductCategory), `unit` (ProductUnit), `lowStockThreshold`, `currentStock`, `isActive` |
| **PurchaseOrder** | Purchase orders for restocking | `id`, `poNumber` (unique), `supplierName`, `status` (PurchaseOrderStatus), `totalAmount` |
| **PurchaseOrderItem** | Line items in purchase orders | `purchaseOrderId`, `productId`, `quantity`, `purchasePrice`, `sellPrice` |
| **StockBatch** | Tracks individual inventory batches | `productId`, `purchaseOrderItemId` (unique), `initialQuantity`, `remainingQuantity`, `purchasePrice`, `sellPrice` |
| **StockTransaction** | All stock movements (in/out) | `productId`, `batchId?`, `type` (StockTransactionType), `quantity`, `balanceBefore`, `balanceAfter`, `workOrderId?` |

### HR & RBAC

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | Login accounts | `id` (UUID), `email` (unique), `passwordHash`, `role` (legacy UserRole), `isSuperAdmin`, `isActive` |
| **Employee** | People in the organization (may or may not have User) | `id`, `firstName`, `lastName`, `email` (unique), `employeeId` (unique, e.g. EMP-001), `status` (EmployeeStatus), `userId?` (unique FK to User), `positionId?`, `departmentId?` |
| **Department** | Organizational units (self-referencing hierarchy) | `id`, `name`, `code` (unique), `parentId?` (FK self), `headId?` (unique FK to Employee) |
| **Position** | Job positions within departments | `id`, `name` (unique), `code` (unique), `roleGroupId`, `departmentId?`, `level?` |
| **RoleGroup** | Named permission bundles | `id`, `name` (unique), `code` (unique). Production codes: `ADMINISTRATOR`, `CALL_CENTER`, `CALL_CENTER_MANAGER`, `IT_TESTING`, `READ_ONLY`. |
| **Role** | Legacy roles (deprecated, kept for migration) | `id`, `name`, `code`, `legacyRole` (UserRole?) |
| **Permission** | Granular permissions (resource.action) | `id`, `resource`, `action`, `category` (PermissionCategory), unique `[resource, action]`. Telephony audit permissions (PR #249–#268): `softphone.handshake`, `telephony.call`, `call_logs.{own,department,department_tree}`, `call_recordings.{own,department,department_tree}`, `missed_calls.{access,manage}`, `call_center.{menu,live,statistics,quality,reports}`. |
| **RoleGroupPermission** | Join: RoleGroup ↔ Permission | Composite PK `[roleGroupId, permissionId]` |
| **RolePermission** | Join: Role ↔ Permission (legacy) | Composite PK `[roleId, permissionId]` |
| **DepartmentPermission** | Join: Department ↔ Permission | Composite PK `[departmentId, permissionId]` |
| **DepartmentRole** | Join: Department ↔ Role (legacy) | Composite PK `[departmentId, roleId]` |
| **EmployeePermission** | Per-employee permission overrides | Composite PK `[employeeId, permissionId]`, `type` (GRANT/DENY) |
| **PositionSetting** | Key-value settings per position | `key` (unique), `positionId?`, `value?` |

### Workflow Automation

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **WorkflowStep** | Steps in the work order workflow | `stepKey` (unique), `stepName`, `stepOrder`, `workOrderTypes` (JSON), `triggerStatus?` |
| **WorkflowStepPosition** | Positions assigned to workflow steps | Unique `[workflowStepId, positionId]`, `isPrimaryAssignee`, `notificationType` |
| **WorkflowTrigger** | Automation triggers | `name`, `triggerType` (WorkflowTriggerType), `condition` (JSON), `workOrderType?` |
| **WorkflowTriggerAction** | Actions fired by triggers | `triggerId`, `actionType` (WorkflowActionType), `targetType`, `templateCode?` |
| **WorkflowTriggerLog** | Records of fired triggers | Unique `[triggerId, workOrderId]` |

### Sales CRM

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **LeadStage** | Pipeline stages | `code` (unique), `name`, `sortOrder` (unique), `color?`, `isTerminal` |
| **LeadSource** | Lead origin channels | `code` (unique), `name` |
| **Lead** | Sales leads | `id`, `leadNumber` (autoincrement), `stageId`, `status` (LeadStatus), `name`, `primaryPhone`, `city`, `address`, `responsibleEmployeeId?`, `totalOneTimePrice?`, `totalMonthlyPrice?`, `isLocked`, approval fields |
| **SalesServiceCategory** | Service groupings | `code` (unique), `name` |
| **SalesService** | Sellable services | `code` (unique), `name`, `monthlyPrice?`, `oneTimePrice?`, `parameters` (JSON), `categoryId?` |
| **LeadService** | Services attached to a lead | Unique `[leadId, serviceId]`, `quantity`, `monthlyPrice?`, `oneTimePrice?` |
| **LeadActivity** | Lead audit trail | `leadId`, `activityType` (LeadActivityType), `category`, `action`, `description`, `metadata` (JSON) |
| **LeadNote** | Notes on leads | `leadId`, `content`, `isPinned`, `createdByName?` |
| **LeadReminder** | Follow-up reminders | `leadId`, `remindAt`, `status` (ReminderStatus) |
| **LeadAppointment** | Scheduled meetings | `leadId`, `startTime`, `endTime?`, `status` (AppointmentStatus) |
| **LeadProposal** | Price proposals | `leadId`, `proposalNumber` (unique), `servicesSnapshot` (JSON), `totalOneTimePrice`, `totalMonthlyPrice` |
| **LeadStageHistory** | Stage transition log | `leadId`, `fromStageId?`, `toStageId`, `changedByName?` |
| **SalesPlan** | Monthly/quarterly/annual targets | `type`, `year`, `month?`, `quarter?`, `employeeId?`, `targetRevenue?`, `achievedRevenue?` |
| **SalesPlanTarget** | Per-service targets within a plan | Unique `[planId, serviceId]`, `targetQuantity`, `achievedQuantity` |
| **SalesPipelineConfig** | Pipeline step configuration | `key` (unique) |
| **SalesPipelineConfigPosition** | Positions assigned to pipeline steps | Unique `[configId, positionId]` |
| **SalesPipelinePermission** | Pipeline action permissions | `permissionKey` (unique) |
| **SalesPipelinePermissionPosition** | Positions with pipeline permissions | Unique `[permissionId, positionId]` |

### Internal Messenger

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Conversation** | Chat conversations (direct or group) | `type` (ConversationType), `name?`, `lastMessageAt?`, `lastMessageText?`, `createdById` |
| **ConversationParticipant** | Users in conversations | Unique `[conversationId, employeeId]`, `role` (MEMBER/ADMIN), `lastReadAt?`, `mutedUntil?`, `isArchived` |
| **Message** | Chat messages | `conversationId`, `senderId`, `content`, `type` (MessageType), `replyToId?`, `isEdited`, `isDeleted` |
| **MessageReaction** | Emoji reactions | Unique `[messageId, employeeId, emoji]` |
| **MessageAttachment** | File attachments | `messageId`, `url`, `fileName`, `fileSize`, `mimeType` |

### Notifications

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **EmailConfig** | SMTP/IMAP configuration (singleton-ish) | `smtpHost`, `smtpPort`, `imapHost`, `imapPort`, credentials, `isActive` |
| **SmsConfig** | SMS provider configuration | `provider`, `apiKey`, `fromNumber`, rate limits, `isActive` |
| **NotificationTemplate** | Email/SMS templates | `code` (unique), `type` (EMAIL/SMS), `subject?`, `body` |
| **NotificationLog** | Sent notification history | `type`, `recipientId?`, `status`, `destination?`, `smsCount?` |

### Telephony / Call Center

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **TelephonyExtension** | SIP extension per user | `crmUserId` (unique FK), `extension` (unique), `sipServer?`, `sipPassword?`, `isOperator` |
| **DeviceHandshakeToken** | One-time tokens for desktop app auth | `token` (unique), `userId`, `expiresAt`, `consumed` |
| **TelephonyQueue** | Call queues | `name` (unique), `strategy` (QueueStrategy), `isAfterHoursQueue`, `worktimeConfig` (JSON) |
| **CallSession** | Individual call records | `linkedId` (unique), `direction` (IN/OUT), `callerNumber`, `queueId?`, `assignedUserId?`, `disposition?`, `recordingStatus` |
| **CallLeg** | Sub-segments of calls (customer, agent, transfer) | `callSessionId`, `type` (CallLegType), `userId?`, `extension?`. Historical backfill via `prisma/backfill-call-legs.ts --dry-run` (PR #264). |
| **CallEvent** | Raw call events from Asterisk | `eventType`, `ts`, `payload` (JSON), `idempotencyKey` (unique) |
| **CallMetrics** | Computed call statistics | `callSessionId` (unique), `waitSeconds`, `ringSeconds`, `talkSeconds`, `holdSeconds`, `isSlaMet?` |
| **MissedCall** | Unanswered calls | `callSessionId` (unique), `reason` (MissedCallReason), `status` (MissedCallStatus), `callerNumber` |
| **CallbackRequest** | Scheduled return calls | `missedCallId` (unique), `status` (CallbackRequestStatus), `attemptsCount` |
| **Recording** | Call recordings | `callSessionId`, `url?`, `filePath?`, `durationSeconds?` |
| **QualityReview** | AI-scored call quality | `callSessionId` (unique), `status` (QualityReviewStatus), `score?`, `summary?`, `flags` (JSON) |
| **QualityRubric** | Scoring criteria | `name`, `weight`, `maxScore` |
| **CallReport** | Per-call operator report (1:1 with CallSession) | `id` (UUID), `callSessionId` (unique FK), `callerClientId?`, `paymentId?`, `subjectClientId?`, `clientBuildingId?`, `buildingId?`, `notes?`, `operatorUserId` (FK to User), `status` (CallReportStatus) |
| **CallReportLabel** | Category labels on call reports (junction) | `id` (UUID), `callReportId` (FK), `categoryCode`, unique `[callReportId, categoryCode]` |

### Client Chats (Unified Inbox)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **ClientChatChannelAccount** | Channel configurations | `type` (ClientChatChannelType), `name`, `status`, `metadata` (JSON) |
| **ClientChatConversation** | External customer conversations | `channelType`, `externalConversationId` (unique), `assignedUserId?`, `clientId?`, `status` (LIVE/CLOSED), `participantId?` |
| **ClientChatParticipant** | External users (visitors) | `channelType`, `externalUserId` (unique), `displayName`, `phone?`, `mappedClientId?` |
| **ClientChatMessage** | All chat messages | `conversationId`, `direction` (IN/OUT), `externalMessageId` (unique), `text`, `senderUserId?`, `participantId?` |
| **ClientChatWebhookFailure** | Failed webhook logs | `channelType`, `error`, `payloadMeta` (JSON) |
| **ClientChatCannedResponse** | Quick reply templates | `title`, `content`, `category?`, `channelType?`, `isGlobal`, `createdById` |
| **ClientChatAssignmentConfig** | Auto-assignment rules | Unique `[channelType]`, `strategy` (`manual`/`round_robin`), `assignableUsers` (string[]) |
| **ClientChatEscalationConfig** | Escalation timing settings | `firstResponseTimeoutMins`, `reassignAfterMins`, `notifyManagerOnEscalation` |
| **ClientChatEscalationEvent** | Escalation history | `conversationId`, `type`, `fromUserId?`, `toUserId?` |
| **ClientChatQueueSchedule** | Weekly agent schedules | Unique `[dayOfWeek, userId]` |
| **ClientChatQueueOverride** | Date-specific schedule overrides | Unique `[date]`, `userIds` (string[]) |

### System / Shared

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **SystemListCategory** | Dropdown category definitions | `code` (unique), `name`, `isUserEditable`, `tableName?`, `fieldName?` |
| **SystemListItem** | Individual dropdown values | Unique `[categoryId, value]`, `displayName`, `colorHex?`, `icon?`, `sortOrder`, `isDefault`, `isSystemManaged` |
| **Translation** | i18n key-value pairs | `key` (unique), `en`, `ka?`, `context?` |
| **ExternalIdCounter** | Auto-incrementing IDs for entities | `entity` (PK), `nextId` |
| **SyncEvent** | Idempotency inbox for webhook events | `eventId` (unique), `entityType`, `status` |
| **AuditLog** | System-wide audit trail | `action` (AuditAction), `entity` (AuditEntity), `entityKey`, `actorId?`, `payload` (JSON) |

---

## 2. Relationships

### Core Relationships

```
User ──1:1──> Employee (optional; employees can exist without login)
Employee ──N:1──> Position ──N:1──> RoleGroup ──M:N──> Permission
Employee ──N:1──> Department (self-referencing hierarchy via parentId)
Department ──1:1──> Employee (headId, department head)

Client ──M:N──> Building (via ClientBuilding join table)
Asset ──N:1──> Building
Incident ──N:1──> Building, ──N:1──> Client (optional)
WorkOrder ──N:1──> Building, ──N:1──> Asset (optional)
WorkOrder ──1:N──> WorkOrder (self-ref: parent/child sub-orders)
```

### Work Order Relationships

```
WorkOrder ──M:N──> Employee (via WorkOrderAssignment)
WorkOrder ──M:N──> Asset (via WorkOrderAsset)
WorkOrder ──1:N──> WorkOrderProductUsage ──N:1──> InventoryProduct
WorkOrder ──1:N──> DeactivatedDevice ──N:1──> InventoryProduct
WorkOrder ──1:N──> WorkOrderActivityLog
WorkOrder ──1:N──> WorkOrderNotification
```

### Sales Relationships

```
Lead ──N:1──> LeadStage, ──N:1──> LeadSource (optional)
Lead ──N:1──> Employee (responsibleEmployee, optional)
Lead ──1:N──> LeadService ──N:1──> SalesService ──N:1──> SalesServiceCategory
Lead ──1:N──> LeadNote, LeadReminder, LeadAppointment, LeadProposal, LeadActivity, LeadStageHistory
SalesPlan ──1:N──> SalesPlanTarget ──N:1──> SalesService
```

### Messenger Relationships

```
Conversation ──1:N──> ConversationParticipant ──N:1──> Employee
Conversation ──1:N──> Message ──N:1──> Employee (sender)
Message ──1:N──> MessageReaction, MessageAttachment
Message ──1:1──> Message (replyTo, self-referencing)
```

### Client Chats Relationships

```
ClientChatChannelAccount ──1:N──> ClientChatConversation
ClientChatConversation ──N:1──> User (assignedUser, optional)
ClientChatConversation ──N:1──> Client (optional)
ClientChatConversation ──N:1──> ClientChatParticipant (optional)
ClientChatConversation ──1:1──> ClientChatConversation (previous, conversation chaining)
ClientChatConversation ──1:N──> ClientChatMessage
ClientChatParticipant ──N:1──> Client (mappedClient, optional)
```

### Telephony Relationships

```
User ──1:1──> TelephonyExtension
CallSession ──N:1──> TelephonyQueue (optional)
CallSession ──N:1──> User (assignedUser, optional)
CallSession ──1:N──> CallLeg, CallEvent, Recording
CallSession ──1:1──> CallMetrics, MissedCall, QualityReview, CallReport
MissedCall ──1:1──> CallbackRequest
CallReport ──N:1──> Client (callerClient), Client (subjectClient), Building, ClientBuilding, User (operator)
CallReport ──1:N──> CallReportLabel
```

---

## 3. Indexes and Constraints

All models use UUID primary keys (except `ExternalIdCounter` which uses `entity` string PK and composite-PK join tables).

**Unique Constraints** (beyond PKs):
- `Building.coreId`, `Client.coreId`, `Asset.coreId` — external system IDs
- `User.email`, `Employee.email`, `Employee.employeeId`, `Employee.userId`
- `Department.code`, `Department.headId`, `Role.name`, `Role.code`
- `Position.name`, `Position.code`, `RoleGroup.name`, `RoleGroup.code`
- `Permission[resource, action]`
- `WorkOrder.workOrderNumber`, `Incident.incidentNumber`
- `Lead.leadNumber`, `LeadProposal.proposalNumber`
- `InventoryProduct.sku`, `PurchaseOrder.poNumber`
- `TelephonyExtension.crmUserId`, `TelephonyExtension.extension`
- `CallSession.linkedId`, `CallEvent.idempotencyKey`
- `ClientChatConversation.externalConversationId`
- `ClientChatParticipant.externalUserId`
- `ClientChatMessage.externalMessageId`
- `CallReport.callSessionId`, `CallReportLabel[callReportId, categoryCode]`
- `SyncEvent.eventId`, `Translation.key`, `SystemListCategory.code`

**Common Index Patterns**: Foreign keys, status fields, timestamp fields (createdAt, lastMessageAt), search fields (name, email, phone), and composite indexes for common query patterns (e.g., `[productId, createdAt]`, `[queueId, startAt]`).

**Cascade Deletes**: Most child records cascade on parent deletion. Employee references in historical records use `onDelete: SetNull` to preserve data.

---

## 4. Migration History

| # | Migration | Date | Purpose |
|---|-----------|------|---------|
| 1 | `init_core` | 2026-01-08 | Initial schema: buildings, clients, assets |
| 2 | `add_users_auth` | 2026-01-09 | User model, authentication |
| 3-4 | `add_user_roles` (x2) | 2026-01-09 | User roles enum and relations |
| 5 | `core_ids_clients_assets` | 2026-01-10 | External coreId fields |
| 6 | `audit_logs` | 2026-01-10 | AuditLog model |
| 7 | `add_incidents` | 2026-01-12 | Incident model and relations |
| 8 | `client_building_many_to_many` | 2026-01-12 | ClientBuilding join table |
| 9 | `add_inventory_system` | 2026-01-13 | Full inventory: products, POs, batches, transactions |
| 10 | `add_position_based_rbac_system` | 2026-01-14 | Positions, RoleGroups, permissions, workflow, sales |
| 11 | `make_incident_clientid_nullable` | 2026-01-15 | Allow incidents without clients |
| 12 | `add_system_lists` | 2026-01-15 | SystemListCategory + SystemListItem |
| 13 | `update_work_orders_workflow` | 2026-01-22 | Work order workflow enhancements |
| 14 | `core_integration_sync_metadata` | 2026-02-21 | SyncEvent for webhook idempotency |
| 15 | `add_telephony_module` | 2026-02-21 | Full telephony: extensions, queues, calls, metrics, recordings, quality |
| 16 | `add_clientchats_module` | 2026-02-22 | Client Chats: channels, conversations, participants, messages |
| 17 | `add_notification_sms_module` | 2026-02-26 | Email/SMS config, templates, notification logs |
| 18 | `add_telegram_channel` | 2026-02-27 | Telegram channel support |
| 19 | `add_conversation_analytics_fields` | 2026-02-27 | Analytics fields on conversations |
| 20 | `add_whatsapp_channel` | 2026-02-27 | WhatsApp channel support |
| 21 | `client_chat_redesign` | 2026-02-27 | Chat conversation redesign with participant linking |
| 22 | `add_softphone_support` | 2026-03-02 | DeviceHandshakeToken for desktop app auth |
| 23 | `add_canned_responses` | 2026-03-17 | ClientChatCannedResponse model |
| 24 | `add_assignment_config` | 2026-03-17 | ClientChatAssignmentConfig model |
| 25 | `add_queue_schedule` | 2026-03-18 | Chat queue scheduling |
| 26 | `add_escalation` | 2026-03-18 | Escalation config and events |
| 27 | `add_joined_at` | 2026-03-19 | joinedAt field on conversations |
| 28 | `add_participant_to_conversation` | 2026-03-19 | participantId on conversations |
| 29 | `add_call_reports` | 2026-04-16 | CallReport, CallReportLabel models, CallReportStatus enum, CALL_CENTER permission category, paymentId index on ClientBuilding |

---

## 5. Seed Data

| Seed File | What It Creates | Command |
|-----------|----------------|---------|
| `seed.ts` | Main entry point, calls other seeds | `pnpm exec ts-node prisma/seed.ts` |
| `seed-permissions.ts` | ~100 RBAC permissions across all categories | `npx tsx prisma/seed-permissions.ts` |
| `seed-system-lists.ts` | 12 dropdown categories with items (types, statuses, priorities). Includes `CALL_REPORT_CATEGORY` (6 items, PR #265). **Now runs on every VM deploy** via GitHub Actions (PR #267). | `npx tsx prisma/seed-system-lists.ts` |
| `seed-workflow-steps.ts` | Workflow step definitions for work order lifecycle | `npx tsx prisma/seed-workflow-steps.ts` |
| `seed-sales.ts` | Lead stages (8 stages), lead sources, pipeline config, permissions | `npx tsx prisma/seed-sales.ts` |
| `seed-rbac.ts` | Default roles and role groups | `npx tsx prisma/seed-rbac.ts` |
| `seed-employees.ts` | Test employee records | `npx tsx prisma/seed-employees.ts` |
| `seed-position-settings.ts` | Default position settings | `npx tsx prisma/seed-position-settings.ts` |
| `seed-inventory.sql` | Sample inventory products (raw SQL) | Manual psql import |
| `set-admin-superadmin.ts` | Marks a user as superadmin | `npx tsx prisma/set-admin-superadmin.ts` |

**One-off data scripts (not seeds, but live in `prisma/`):**

| Script | What It Does | Command |
|--------|--------------|---------|
| `backfill-call-legs.ts` | Populate CallLeg rows for historical CallSessions that pre-date the CallLeg model (PR #264). Defaults to `--dry-run`; pass `--apply` for a real run. | `npx tsx prisma/backfill-call-legs.ts` |

---

## 6. Enums

| Enum | Values | Used By |
|------|--------|---------|
| **DeviceStatus** | ONLINE, OFFLINE, UNKNOWN | Asset.status |
| **WorkOrderType** | INSTALLATION, DIAGNOSTIC, RESEARCH, DEACTIVATE, REPAIR_CHANGE, ACTIVATE | WorkOrder.type |
| **WorkOrderStatus** | CREATED, LINKED_TO_GROUP, IN_PROGRESS, COMPLETED, CANCELED | WorkOrder.status |
| **UserRole** | ADMIN, CALL_CENTER, TECHNICIAN, WAREHOUSE, MANAGER | User.role (legacy) |
| **EmployeeStatus** | ACTIVE, INACTIVE, ON_LEAVE, TERMINATED | Employee.status |
| **IncidentStatus** | CREATED, IN_PROGRESS, COMPLETED, WORK_ORDER_INITIATED | Incident.status |
| **IncidentPriority** | LOW, MEDIUM, HIGH, CRITICAL | Incident.priority |
| **ContactMethod** | PHONE, EMAIL, IN_PERSON, OTHER | Incident.contactMethod |
| **ProductCategory** | ROUTER, CONTROLLER, SENSOR, CABLE, ACCESSORY, HARDWARE, SOFTWARE, OTHER | InventoryProduct.category |
| **ProductUnit** | PIECE, METER, KG, BOX, SET | InventoryProduct.unit |
| **PurchaseOrderStatus** | DRAFT, ORDERED, SHIPPED, RECEIVED, CANCELLED | PurchaseOrder.status |
| **StockTransactionType** | PURCHASE_IN, WORK_ORDER_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, RETURN_IN, DAMAGED_OUT | StockTransaction.type |
| **LeadStatus** | ACTIVE, WON, LOST | Lead.status |
| **LeadActivityType** | 26 values (LEAD_CREATED through VIEWED) | LeadActivity.activityType |
| **SalesPlanType** | MONTHLY, QUARTERLY, ANNUAL | SalesPlan.type |
| **SalesPlanStatus** | DRAFT, ACTIVE, COMPLETED, CANCELLED | SalesPlan.status |
| **ReminderStatus** | PENDING, COMPLETED, CANCELLED | LeadReminder.status |
| **AppointmentStatus** | SCHEDULED, COMPLETED, CANCELLED, NO_SHOW | LeadAppointment.status |
| **NotificationType** | EMAIL, SMS | NotificationTemplate.type, NotificationLog.type |
| **ConversationType** | DIRECT, GROUP | Conversation.type |
| **ConversationParticipantRole** | MEMBER, ADMIN | ConversationParticipant.role |
| **MessageType** | TEXT, IMAGE, FILE, SYSTEM | Message.type |
| **PermissionCategory** | GENERAL, BUILDINGS, CLIENTS, INCIDENTS, WORK_ORDERS, INVENTORY, EMPLOYEES, REPORTS, ADMIN, SALES, MESSENGER, TELEPHONY, CLIENT_CHATS, CALL_CENTER | Permission.category |
| **PermissionOverride** | GRANT, DENY | EmployeePermission.type |
| **AuditAction** | CREATE, UPDATE, DELETE | AuditLog.action |
| **AuditEntity** | BUILDING, CLIENT, ASSET, WORK_ORDER, USER, INCIDENT, LEAD, SALES_SERVICE, SALES_PLAN, CALL_SESSION | AuditLog.entity |
| **WorkflowTriggerType** | STATUS_CHANGE, FIELD_CHANGE, INACTIVITY, DEADLINE_PROXIMITY | WorkflowTrigger.triggerType |
| **WorkflowActionType** | SYSTEM_NOTIFICATION, EMAIL, SMS | WorkflowTriggerAction.actionType |
| **CallDirection** | IN, OUT | CallSession.direction |
| **CallDisposition** | ANSWERED, MISSED, ABANDONED, BUSY, FAILED, NOANSWER | CallSession.disposition |
| **CallLegType** | CUSTOMER, AGENT, TRANSFER | CallLeg.type |
| **QueueStrategy** | RRMEMORY, FEWESTCALLS, RANDOM, RINGALL, LINEAR, WRANDOM | TelephonyQueue.strategy |
| **MissedCallReason** | OUT_OF_HOURS, ABANDONED, NO_ANSWER | MissedCall.reason |
| **MissedCallStatus** | NEW, HANDLED, IGNORED | MissedCall.status |
| **CallbackRequestStatus** | PENDING, SCHEDULED, ATTEMPTING, DONE, FAILED, CANCELED | CallbackRequest.status |
| **RecordingStatus** | PENDING, AVAILABLE, FAILED | CallSession.recordingStatus |
| **QualityReviewStatus** | PENDING, PROCESSING, DONE, FAILED | QualityReview.status |
| **CallReportStatus** | DRAFT, COMPLETED | CallReport.status |
| **ClientChatChannelType** | WEB, VIBER, FACEBOOK, TELEGRAM, WHATSAPP | ClientChat models |
| **ClientChatStatus** | LIVE, CLOSED | ClientChatConversation.status |
| **ClientChatDirection** | IN, OUT | ClientChatMessage.direction |
| **ClientChatAccountStatus** | ACTIVE, INACTIVE | ClientChatChannelAccount.status |
