# SMS Module - Technical Documentation

## Overview

The SMS module provides SMS sending capabilities via the **Sender.ge** API, a Georgian SMS gateway service. It supports manual notifications to employees, automated workflow-triggered SMS, work order assignment notifications, delivery tracking, and configurable spam protection.

**Provider:** [Sender.ge](https://sender.ge/docs/api.php)
**Admin UI:** `/app/admin/sms-config`

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Entry Points                            │
├──────────────┬──────────────────┬────────────────────────────┤
│ Admin Manual │ Work Order       │ Workflow Trigger Engine     │
│ Send         │ Notifications    │                            │
└──────┬───────┴────────┬─────────┴──────────┬─────────────────┘
       │                │                    │
       ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│              NotificationService.send()                      │
│              (batch cap enforcement)                          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              SmsSenderService.sendSms()                       │
│              (rate limits, cooldown, auto-disable)            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│              Sender.ge REST API                              │
│              https://sender.ge/api/send.php                  │
└──────────────────────────────────────────────────────────────┘
```

All SMS traffic flows through `SmsSenderService.sendSms()`, which is the single chokepoint where rate limiting and spam protection are enforced.

---

## Sender.ge API Integration

### Send SMS

```
GET https://sender.ge/api/send.php?apikey=KEY&smsno=2&destination=5XXXXXXXX&content=Hello
```

| Parameter     | Description                                                              |
|---------------|--------------------------------------------------------------------------|
| `apikey`      | API key (contains sender title)                                          |
| `smsno`       | `1` = advertising (with sender number), `2` = informational (without)    |
| `destination` | 9-digit Georgian mobile number without `+995`                            |
| `content`     | Message text (unicode supported)                                         |

**Response:** `{ messageId, qnt, statusId }` where `statusId: 1` = Sent.

### Delivery Report

```
GET https://sender.ge/api/callback.php?apikey=KEY&messageId=ID
```

**Response:** `{ messageId, statusId, timestamp }` where `statusId`: `0` = Pending, `1` = Delivered, `2` = Undelivered.

### Balance Check

```
GET https://sender.ge/api/getBalance.php?apikey=KEY
```

**Response:** `{ balance, overdraft }`

---

## Database Schema

### SmsConfig

Stores provider credentials and spam protection settings. Single-row table.

| Column               | Type    | Default       | Description                                |
|----------------------|---------|---------------|--------------------------------------------|
| `provider`           | String  | `"sender_ge"` | Provider identifier                        |
| `apiKey`             | String  | `""`          | Sender.ge API key                          |
| `fromNumber`         | String  | `""`          | Sender number / title                      |
| `smsNo`              | Int     | `2`           | SMS type (1=advertising, 2=informational)  |
| `isActive`           | Boolean | `false`       | Global on/off toggle                       |
| `maxPerMinute`       | Int     | `10`          | Rate limit: max SMS per minute             |
| `maxPerHour`         | Int     | `100`         | Rate limit: max SMS per hour               |
| `maxPerDay`          | Int     | `500`         | Rate limit: max SMS per day                |
| `recipientCooldownMin` | Int   | `5`           | Min minutes between SMS to same number     |
| `maxBatchRecipients` | Int     | `50`          | Max recipients per single send action      |
| `autoDisableOnLimit` | Boolean | `true`        | Auto-disable service when daily cap is hit |

### NotificationLog (SMS-relevant fields)

| Column            | Type     | Description                                        |
|-------------------|----------|----------------------------------------------------|
| `type`            | Enum     | `SMS` for SMS entries                              |
| `recipientId`     | String?  | Employee ID (null for test SMS)                    |
| `destination`     | String?  | Raw phone number (for all SMS including tests)     |
| `body`            | String   | Message content                                    |
| `status`          | String   | `PENDING`, `SENT`, `DELIVERED`, `FAILED`           |
| `senderMessageId` | String?  | Sender.ge message ID for delivery tracking         |
| `deliveryStatus`  | String?  | `PENDING`, `DELIVERED`, `UNDELIVERED`              |
| `deliveredAt`     | DateTime?| Delivery timestamp from Sender.ge                  |
| `smsCount`        | Int?     | Number of SMS segments used                        |
| `errorMessage`    | String?  | Error details if failed                            |

---

## Spam Protection

All protections are enforced inside `SmsSenderService.sendSms()`, the single gateway for every SMS path.

### Rate Limits

Checked before every send using `NotificationLog` counts:

| Limit            | Default | Behavior when exceeded                          |
|------------------|---------|-------------------------------------------------|
| Per minute       | 10      | Returns error, SMS blocked                      |
| Per hour         | 100     | Returns error, SMS blocked                      |
| Per day          | 500     | Returns error + auto-disables SMS if enabled    |

### Per-Recipient Cooldown

Prevents sending to the same phone number within the configured cooldown window (default 5 minutes). Catches workflow loops that fire repeatedly for the same employee.

### Batch Cap

Enforced in `NotificationService.send()`. Prevents sending to more than `maxBatchRecipients` (default 50) employees in a single action.

### Auto-Disable

When `autoDisableOnLimit = true` and the daily limit is reached, the service sets `isActive = false` in the database. All subsequent `sendSms()` calls immediately return without hitting the API. Requires manual re-enable from the admin UI.

---

## API Endpoints

All endpoints require `JwtAuthGuard` + `AdminOnlyGuard` + `PositionPermissionGuard` with `sms_config.access` permission.

**Base path:** `/v1/admin/notifications`

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | `/sms-config`                 | Get SMS config (API key masked)          |
| PUT    | `/sms-config`                 | Create or update SMS configuration       |
| POST   | `/sms-config/test`            | Send a test SMS                          |
| GET    | `/sms-config/balance`         | Get Sender.ge account balance            |
| GET    | `/sms-logs`                   | List SMS logs (paginated, filterable)    |
| GET    | `/sms-logs/stats`             | Get aggregate SMS statistics             |
| POST   | `/sms-logs/:id/check-delivery`| Check delivery status for specific SMS   |
| POST   | `/sms-logs/refresh-deliveries`| Batch refresh all pending delivery statuses |

---

## Permission

| Permission          | Category | Description                                          |
|---------------------|----------|------------------------------------------------------|
| `sms_config.access` | ADMIN    | Access SMS configuration, logs, and spam protection   |

- **SuperAdmin** always has access (bypasses all permission checks).
- Assign to role groups via **Admin > Role Groups > Assign Permissions**.
- Seeded in `prisma/seed-permissions.ts` and `prisma/seed-rbac.ts`.

---

## Backend Files

| File                                          | Purpose                                       |
|-----------------------------------------------|-----------------------------------------------|
| `src/notifications/sms.service.ts`            | `SmsSenderService` - sends SMS + rate limits   |
| `src/notifications/sms-config.service.ts`     | `SmsConfigService` - config CRUD, test, balance, delivery checks |
| `src/notifications/notification-log.service.ts`| Log CRUD, SMS stats, delivery status updates  |
| `src/notifications/notification.service.ts`   | Sends notifications to employees (batch cap)  |
| `src/notifications/dto/update-sms-config.dto.ts` | DTO with validation for config updates     |
| `src/notifications/notifications.module.ts`   | NestJS module registration                    |
| `src/v1/notifications.controller.ts`          | REST API endpoints                            |
| `prisma/schema.prisma`                        | `SmsConfig` and `NotificationLog` models      |

---

## Frontend

**Admin page:** `src/app/app/admin/sms-config/page.tsx`

Two tabs:
1. **Configuration** - Balance display, service toggle, Sender.ge credentials, SMS type selector, spam protection settings, test SMS
2. **SMS Logs** - Stats cards, status filters, paginated log list with delivery status checks, bulk refresh

---

## Configuration Guide

1. Go to **Admin > SMS Configuration**
2. Enter your Sender.ge API key and sender number
3. Select SMS type (informational recommended)
4. Toggle SMS Service **ON**
5. Adjust spam protection defaults if needed
6. Click **Save Configuration**
7. Use **Send Test SMS** to verify

The `RemoteAddr` / `RemoteAddr2` values from your provider are IP whitelist entries configured in the Sender.ge dashboard, not in the CRM.
