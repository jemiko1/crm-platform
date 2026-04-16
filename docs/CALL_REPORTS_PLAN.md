# Call Reports & Scoped Telephony Permissions — Implementation Plan

**Date:** 2026-04-16
**Status:** APPROVED — Ready to build
**Branch:** `feature/call-reports` (to be created)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Changes](#2-database-changes)
3. [Scoped Permission System](#3-scoped-permission-system)
4. [Backend — Call Reports Module](#4-backend--call-reports-module)
5. [Backend — Payment ID Lookup](#5-backend--payment-id-lookup)
6. [Backend — Socket.IO Call Report Trigger](#6-backend--socketio-call-report-trigger)
7. [Frontend — Call Report Modal](#7-frontend--call-report-modal)
8. [Frontend — Call Center > Call Reports Page](#8-frontend--call-center--call-reports-page)
9. [Frontend — Building > Call Reports Tab](#9-frontend--building--call-reports-tab)
10. [Frontend — Admin > List Items Category](#10-frontend--admin--list-items-category)
11. [Frontend — Recording Playback](#11-frontend--recording-playback)
12. [Seed Data](#12-seed-data)
13. [Implementation Phases](#13-implementation-phases)
14. [Open Items for Later](#14-open-items-for-later)

---

## 1. Overview

### What We're Building

Operators fill a **Call Report** during or after each connected call. The report captures:
- **Who the call is about** (resolved via payment ID → client + apartment + building)
- **What category** the call falls into (multi-select from dynamic list)
- **Operator notes** (free text)

Reports are linked to buildings and viewable from a new building tab and a dedicated Call Center sub-page.

### Key Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Report UI location | CRM browser (modal), not softphone | Full screen space for forms, search, lookups |
| Trigger mechanism | Socket.IO event on call connect | Real-time, already have /telephony namespace |
| Who sees the form | Only `isOperator = true` users | IT/HR/other depts don't need call reports |
| Category storage | `SystemListItem.value` (stable code) | Labels can be renamed; reports keep stable reference |
| Caller vs Subject | Separate fields | Caller (John) may report issue for another person (Jane) |
| Draft support | Yes — auto-draft on call end, finalize later | Operators shouldn't be blocked during calls |
| Permission scoping | `.own` / `.department` / `.department_tree` / `.all` | Handles head-vs-operator, parent-vs-child dept visibility |

---

## 2. Database Changes

### 2.1 New Model: `CallReport`

```prisma
model CallReport {
  id                String            @id @default(uuid())
  callSessionId     String            @unique
  callerClientId    String?
  paymentId         String?
  subjectClientId   String?
  clientBuildingId  String?
  buildingId        String?
  notes             String?
  operatorUserId    String
  status            CallReportStatus  @default(DRAFT)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  callSession       CallSession       @relation(fields: [callSessionId], references: [id])
  callerClient      Client?           @relation("CallReportCaller", fields: [callerClientId], references: [id])
  subjectClient     Client?           @relation("CallReportSubject", fields: [subjectClientId], references: [id])
  clientBuilding    ClientBuilding?   @relation(fields: [clientBuildingId], references: [id])
  building          Building?         @relation(fields: [buildingId], references: [id])
  operatorUser      User              @relation(fields: [operatorUserId], references: [id])
  labels            CallReportLabel[]

  @@index([callSessionId])
  @@index([buildingId])
  @@index([operatorUserId])
  @@index([status])
  @@index([createdAt])
  @@index([paymentId])
}

enum CallReportStatus {
  DRAFT
  COMPLETED
}
```

### 2.2 New Model: `CallReportLabel`

Junction table — many-to-many between CallReport and SystemListItem.

```prisma
model CallReportLabel {
  id             String         @id @default(uuid())
  callReportId   String
  categoryCode   String         // Stores SystemListItem.value (stable code)
  createdAt      DateTime       @default(now())

  callReport     CallReport     @relation(fields: [callReportId], references: [id], onDelete: Cascade)

  @@unique([callReportId, categoryCode])
  @@index([callReportId])
  @@index([categoryCode])
}
```

**Why `categoryCode` is a string, not an FK:**
- `SystemListItem.value` is the stable code (e.g., `CODE_PROBLEM`)
- Even if the list item is renamed or deactivated, the report retains its code
- To display the label, JOIN on `SystemListItem.value` WHERE `category.code = 'call-report-categories'`
- If the list item is deleted, the code still exists in the report — show as-is

### 2.3 New Enum: `PermissionCategory` Addition

Add to existing enum:
```prisma
enum PermissionCategory {
  // ... existing values ...
  CALL_CENTER    // NEW — for call center specific permissions
}
```

### 2.4 Relations to Add on Existing Models

```prisma
// On CallSession — add:
callReport      CallReport?

// On Client — add:
callerCallReports   CallReport[] @relation("CallReportCaller")
subjectCallReports  CallReport[] @relation("CallReportSubject")

// On ClientBuilding — add:
callReports     CallReport[]

// On Building — add:
callReports     CallReport[]

// On User — add:
callReports     CallReport[]
```

### 2.5 Index on `ClientBuilding.paymentId`

```prisma
// On ClientBuilding — add index for fast payment ID search:
@@index([paymentId])
```

---

## 3. Scoped Permission System

### 3.1 Concept

Permissions gain a **scope** dimension. The scope determines HOW MUCH data the permission grants access to. The scope is encoded in the permission `action` field:

| Scope suffix | Meaning | Data filter |
|-------------|---------|-------------|
| `.own` | Only your own data | `assignedUserId = currentUser.id` |
| `.department` | Your department, peers at ≤ your position level | `employee.departmentId = yours AND position.level <= yours` |
| `.department_tree` | Your dept + all child depts, employees at ≤ your level | `departmentId IN [yours + descendants] AND position.level <= yours` |
| `.all` | Everything, no filter | No restriction |

**Highest scope wins.** If user has both `.own` and `.department`, `.department` applies.

### 3.2 New Permissions

```
Resource: call_center       Action: menu          Category: CALL_CENTER
Resource: call_center       Action: reports        Category: CALL_CENTER

Resource: call_logs         Action: own            Category: CALL_CENTER
Resource: call_logs         Action: department     Category: CALL_CENTER
Resource: call_logs         Action: department_tree Category: CALL_CENTER
Resource: call_logs         Action: all            Category: CALL_CENTER

Resource: call_recordings   Action: own            Category: CALL_CENTER
Resource: call_recordings   Action: department     Category: CALL_CENTER
Resource: call_recordings   Action: department_tree Category: CALL_CENTER
Resource: call_recordings   Action: all            Category: CALL_CENTER
```

Total: 10 new permissions.

### 3.3 Scope Resolution — Backend Utility

Shared utility: `resolveDataScope(userId, resource)`

```typescript
// Pseudocode
async function resolveDataScope(userId: string, resource: string): Promise<{
  scope: 'own' | 'department' | 'department_tree' | 'all';
  userLevel: number;
  departmentId: string;
  departmentIds: string[]; // For department_tree: all descendant dept IDs
}> {
  // 1. Load user → employee → position (level) → department
  // 2. Check permissions in priority order: .all > .department_tree > .department > .own
  // 3. If department_tree: recursively collect all child department IDs
  // 4. Return scope info for the calling service to filter queries
}
```

### 3.4 Query Filter — Backend Utility

Shared utility: `buildScopeFilter(scope, userId)` returns Prisma `where` clause:

```typescript
function buildScopeFilter(scopeInfo) {
  switch (scopeInfo.scope) {
    case 'all':
      return {}; // No filter

    case 'department_tree':
      return {
        assignedUser: {
          employee: {
            departmentId: { in: scopeInfo.departmentIds },
            position: { level: { lte: scopeInfo.userLevel } }
          }
        }
      };

    case 'department':
      return {
        assignedUser: {
          employee: {
            departmentId: scopeInfo.departmentId,
            position: { level: { lte: scopeInfo.userLevel } }
          }
        }
      };

    case 'own':
      return { assignedUserId: scopeInfo.userId };
  }
}
```

### 3.5 Position Level Validation Warning

When updating a position's level or a department's parent:
- Check if any child department has positions with higher levels than parent dept head
- Return warning (not error) in API response: `{ warnings: ["Head of Call Center (level 90) exceeds Head of Operations (level 80)"] }`
- Frontend shows yellow warning banner — does not block save

### 3.6 Example Configurations

```
Operations Department (ქეთი, Head, level 80)
  └── Call Center (ანანო, Head, level 70)
        ├── Operator 1 (level 40)
        ├── Operator 2 (level 40)
        └── Operator 3 (level 40)
```

| User | Permission | Scope | Sees recordings of |
|------|-----------|-------|--------------------|
| Operator 1 | `call_recordings.department` | department, level ≤ 40 | Operator 2, 3 (same dept, same level) |
| ანანო | `call_recordings.department` | department, level ≤ 70 | Operators 1,2,3 + herself |
| ქეთი | `call_recordings.department_tree` | Operations + children, level ≤ 80 | ანანო + all operators + Operations employees |
| CEO | `call_recordings.all` | everything | All recordings |
| IT Employee | `call_recordings.own` | own only | Only their own calls |

---

## 4. Backend — Call Reports Module

### 4.1 Module Structure

```
backend/crm-backend/src/call-reports/
├── call-reports.module.ts
├── call-reports.controller.ts
├── call-reports.service.ts
├── dto/
│   ├── create-call-report.dto.ts
│   ├── update-call-report.dto.ts
│   └── query-call-report.dto.ts
```

### 4.2 Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `POST` | `/v1/call-reports` | `call_center.reports` | Create call report (from modal) |
| `PATCH` | `/v1/call-reports/:id` | `call_center.reports` | Update report (complete draft, edit) |
| `GET` | `/v1/call-reports` | `call_center.reports` | List reports (filters: status, buildingId, operatorId, dateRange) |
| `GET` | `/v1/call-reports/:id` | `call_center.reports` | Single report detail |
| `GET` | `/v1/call-reports/my-drafts` | `call_center.reports` | Current user's draft reports |
| `GET` | `/v1/call-reports/payment-lookup` | `call_center.reports` | Payment ID search (see section 5) |

### 4.3 Create DTO

```typescript
class CreateCallReportDto {
  callSessionId: string;       // Required — links to the call
  callerClientId?: string;     // Auto-resolved from phone, sent by frontend
  paymentId?: string;          // Optional — operator may not have it
  subjectClientId?: string;    // Resolved from paymentId by frontend
  clientBuildingId?: string;   // Resolved from paymentId by frontend
  buildingId?: string;         // Resolved from paymentId by frontend
  labels: string[];            // Array of category codes, min 1 required
  notes?: string;              // Optional free text
  status: 'DRAFT' | 'COMPLETED';  // Operator chooses
}
```

### 4.4 Service Logic

**Create:**
1. Validate callSessionId exists and has no existing report (1:1)
2. Validate labels are valid `SystemListItem.value` codes in `call-report-categories`
3. If paymentId provided, validate it exists in `ClientBuilding`
4. Set `operatorUserId` from JWT context
5. Create `CallReport` + `CallReportLabel` entries in transaction

**Update:**
1. Only the operator who created it can update (or admin with `.all`)
2. Can update: paymentId/resolved fields, labels, notes, status
3. If status changing DRAFT → COMPLETED: validate min 1 label exists

**List (with scope):**
1. Resolve data scope for current user
2. Apply scope filter to `operatorUserId` (who filed the report)
3. Apply additional filters: buildingId, status, dateRange
4. Return paginated results with relations

---

## 5. Backend — Payment ID Lookup

### 5.1 Endpoint

```
GET /v1/call-reports/payment-lookup?q=01024
```

### 5.2 Response

```json
{
  "results": [
    {
      "paymentId": "01024037134",
      "client": {
        "id": "uuid",
        "firstName": "გიორგი",
        "lastName": "მაჭავარიანი",
        "primaryPhone": "599123456",
        "idNumber": "01024037134"
      },
      "apartment": {
        "id": "uuid",
        "apartmentNumber": "34",
        "entranceNumber": "3",
        "floorNumber": "5",
        "balance": -12.50
      },
      "building": {
        "id": "uuid",
        "name": "პეტრე იბერის N30 ბლოკი 3",
        "address": "პეტრე იბერის 30"
      }
    }
  ]
}
```

### 5.3 Query Logic

```sql
SELECT cb.*, c.*, b.*
FROM "ClientBuilding" cb
JOIN "Client" c ON cb."clientId" = c.id
JOIN "Building" b ON cb."buildingId" = b.id
WHERE cb."paymentId" LIKE '01024%'
  AND c."isActive" = true
LIMIT 10
```

- Searches `ClientBuilding.paymentId` with prefix match (starts with)
- Returns first 10 matches for typeahead
- Includes full client, apartment, and building details

---

## 6. Backend — Socket.IO Call Report Trigger

### 6.1 Event Flow

```
Asterisk → AMI Bridge → Backend Ingestion → call_answer event
  → TelephonyIngestionService processes event
  → Checks: is assignedUser an operator? (isOperator = true)
  → YES: emit Socket.IO event on /telephony namespace
```

### 6.2 Socket Event

```typescript
// Emitted to the specific operator's socket room
socket.to(`user:${assignedUserId}`).emit('call:report-trigger', {
  callSessionId: session.id,
  direction: session.direction,       // IN or OUT
  callerNumber: session.callerNumber,
  calleeNumber: session.calleeNumber,
  callerClient: resolvedClient || null,  // If phone number matched a client
});
```

### 6.3 Frontend Handling

```
1. PhonePage or layout-level listener receives 'call:report-trigger'
2. Checks: does current user have isOperator = true? (already in session)
3. YES: opens CallReport modal with pre-filled data
4. NO: ignores event
```

---

## 7. Frontend — Call Report Modal

### 7.1 Trigger

- Auto-opens when `call:report-trigger` socket event is received
- Also openable manually from Call Center > Call Reports page ("New Report" for edge cases)

### 7.2 Layout

```
┌─────────────────────────────────────────────────┐
│  Call Report                              [X]   │
│─────────────────────────────────────────────────│
│                                                 │
│  Caller: გიორგი მაჭავარიანი (599123456)        │
│  Direction: Inbound  |  Time: 14:32             │
│                                                 │
│  ┌─── Payment ID ────────────────────────────┐  │
│  │ [0102403____] (typeahead search)          │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌─── Resolved Customer ─────────────────────┐  │
│  │ Client: ჯეინ გრეი  |  ID: 01028012345    │  │
│  │ Phone: 599987654                          │  │
│  │ Building: პეტრე იბერის N30 ბლოკი 3       │  │
│  │ Apartment: #34, Floor 5, Entrance 3       │  │
│  │ Balance: -12.50 ₾                         │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌─── Categories ────────────────────────────┐  │
│  │ [Search categories...]                    │  │
│  │ ☑ კოდის ინსტრუქცია                       │  │
│  │ ☐ კოდით სარგებლობის პრობლემა              │  │
│  │ ☐ სარეზერვო ჩიპის გააქტიურება            │  │
│  │ ☑ ჩიპით სარგებლობის პრობლემა              │  │
│  │ ☐ ჩიპის გაუქმება                          │  │
│  │ ☐ მისამართები/სამუშაო საათები              │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  ┌─── Notes ─────────────────────────────────┐  │
│  │ Customer reported chip not working since   │  │
│  │ yesterday. Advised to restart device...    │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│        [Save Draft]          [Complete]          │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 7.3 Behavior

- **Payment ID field:** Typeahead — after 3+ chars, searches via `/payment-lookup?q=...`
  - On match: displays Resolved Customer card, auto-fills subjectClientId, clientBuildingId, buildingId
  - No match: shows "No matching results found"
  - Empty: allowed (not all calls have a payment ID)

- **Categories:** Multi-select checklist with search filter. At least 1 required to complete.

- **Notes:** Optional free text textarea.

- **Save Draft:** Saves with `status: DRAFT`. Modal closes. Operator can complete later.

- **Complete:** Validates min 1 label selected. Saves with `status: COMPLETED`. Modal closes.

- **Auto-draft:** If the modal is open and the call ends (or user navigates away), auto-save as DRAFT if any field has data.

- **i18n:** All labels use `t()` with keys in en.json and ka.json.

---

## 8. Frontend — Call Center > Call Reports Page

### 8.1 Location

New sub-page: `/app/call-center/reports`
Added to Call Center sidebar/tab navigation alongside: Overview, Logs, Missed, Live, Quality, Agents, Statistics.

### 8.2 Layout

**Filters bar:**
- Status: All / Draft / Completed
- Date range picker
- Operator filter (dropdown)
- Building filter (dropdown)
- Category filter (dropdown)

**Table columns:**
| Date | Direction | Caller | Subject Client | Building | Apartment | Categories | Operator | Status | Actions |
|------|-----------|--------|---------------|----------|-----------|-----------|----------|--------|---------|

**Actions:**
- Click row → opens report detail/edit modal
- Draft reports show "Complete" quick action
- Recording play button (if recording available, subject to permissions)

### 8.3 Draft Banner

At the top of the page, if current user has draft reports:
```
⚠ You have 3 draft reports to complete. [View Drafts]
```

---

## 9. Frontend — Building > Call Reports Tab

### 9.1 Location

7th tab on building detail page (`/app/buildings/[buildingId]`).
Tab label: "Call Reports" / "ზარის ანგარიშები"

### 9.2 Content

Same table structure as Call Center reports page, but:
- Pre-filtered by `buildingId` (no building filter needed)
- Only shows COMPLETED reports
- Respects data scope permissions (user only sees reports they're allowed to see)

---

## 10. Frontend — Admin > List Items Category

### 10.1 Seed

New `SystemListCategory`:
```
code: "call-report-categories"
name: "Call Report Categories"
nameKa: "ზარის ანგარიშის კატეგორიები"
isUserEditable: true
```

### 10.2 Initial Items (for testing)

| value (code, immutable) | displayName | displayNameKa |
|------------------------|-------------|---------------|
| `ADDRESS_WORKHOURS` | Address / Working hours | მისამართები/სამუშაო საათები |
| `CODE_INSTRUCTION` | Code instruction | კოდის ინსტრუქცია |
| `CODE_USAGE_PROBLEM` | Code usage problem | კოდით სარგებლობის პრობლემა |
| `BACKUP_CHIP_ACTIVATION` | Backup chip activation | სარეზერვო ჩიპის გააქტიურება |
| `CHIP_USAGE_PROBLEM` | Chip usage problem | ჩიპით სარგებლობის პრობლემა |
| `CHIP_DEACTIVATION` | Chip deactivation | ჩიპის გაუქმება |

All items: `isSystemManaged: false`, `isActive: true`.

Admin can add, rename, reorder, or deactivate items. The `value` code never changes after creation.

---

## 11. Frontend — Recording Playback

### 11.1 Where

Inline in Call Center > Logs page and Call Reports page. Small play button on rows where `recordingStatus = AVAILABLE`.

### 11.2 Component

```
[▶] ───────────●──── 02:34 / 05:12  [⬇]
```

- HTML5 `<audio>` element
- Source: `/v1/telephony/recordings/:id/audio` (existing endpoint)
- Download button alongside
- **Gated by permissions:** Only visible if user has `call_recordings.own/department/department_tree/all` and the recording falls within their scope

### 11.3 Backend Change

The existing `GET /v1/telephony/recordings/:id/audio` endpoint currently requires `telephony.menu`. Change to:
- Check `call_recordings.*` scoped permission
- Verify the recording's call session falls within user's data scope
- 403 if not authorized

---

## 12. Seed Data

### 12.1 Permissions (seed-permissions.ts)

Add to existing seed:
```typescript
// CALL_CENTER category
{ resource: 'call_center', action: 'menu',             category: 'CALL_CENTER' },
{ resource: 'call_center', action: 'reports',           category: 'CALL_CENTER' },
{ resource: 'call_logs',   action: 'own',               category: 'CALL_CENTER' },
{ resource: 'call_logs',   action: 'department',         category: 'CALL_CENTER' },
{ resource: 'call_logs',   action: 'department_tree',    category: 'CALL_CENTER' },
{ resource: 'call_logs',   action: 'all',               category: 'CALL_CENTER' },
{ resource: 'call_recordings', action: 'own',            category: 'CALL_CENTER' },
{ resource: 'call_recordings', action: 'department',     category: 'CALL_CENTER' },
{ resource: 'call_recordings', action: 'department_tree', category: 'CALL_CENTER' },
{ resource: 'call_recordings', action: 'all',            category: 'CALL_CENTER' },
```

### 12.2 Call Report Categories (seed-list-items.ts or inline)

Seed the `SystemListCategory` + 6 `SystemListItem` entries as defined in section 10.2.

---

## 13. Implementation Phases

### Phase 1: Foundation (can be parallelized)

| Task | What | Files |
|------|------|-------|
| 1a | Prisma migration: CallReport, CallReportLabel, new indexes, new enum value | `schema.prisma`, migration |
| 1b | Seed: CALL_CENTER permissions (10 new) | `seed-permissions.ts` |
| 1c | Seed: call-report-categories SystemList + 6 items | seed script |
| 1d | Backend: scope resolution utility (`resolveDataScope`, `buildScopeFilter`) | `src/common/utils/data-scope.ts` |

### Phase 2: Call Reports Backend

| Task | What | Files |
|------|------|-------|
| 2a | CallReports module: service, controller, DTOs | `src/call-reports/` |
| 2b | Payment ID lookup endpoint | `src/call-reports/` |
| 2c | Apply scope filtering to call reports list query | `call-reports.service.ts` |

### Phase 3: Socket Trigger

| Task | What | Files |
|------|------|-------|
| 3a | Emit `call:report-trigger` on call connect for operator users | `telephony-ingestion.service.ts` |

### Phase 4: Frontend — Call Report Modal

| Task | What | Files |
|------|------|-------|
| 4a | Socket listener for `call:report-trigger` in layout or call center context | Layout component |
| 4b | CallReport modal component (payment ID search, categories, notes) | New component |
| 4c | Payment ID typeahead with resolved customer card | Within modal |
| 4d | i18n: all strings in en.json + ka.json | Locale files |

### Phase 5: Frontend — Pages

| Task | What | Files |
|------|------|-------|
| 5a | Call Center > Call Reports page (table, filters, draft banner) | New page |
| 5b | Building > Call Reports tab (7th tab) | Building detail page |
| 5c | Call Center sidebar navigation update | Sidebar component |

### Phase 6: Recordings & Scope Enforcement

| Task | What | Files |
|------|------|-------|
| 6a | Apply scope to recording access endpoint | Recording controller |
| 6b | Apply scope to call logs endpoint | Telephony controller |
| 6c | Inline audio player component | Shared component |
| 6d | Audio player in call logs and call reports pages | Log/report pages |

### Phase 7: Validation & Polish

| Task | What | Files |
|------|------|-------|
| 7a | Position level validation warning (admin UI) | Position service + frontend |
| 7b | Unit tests: call reports CRUD, scope filtering, payment lookup | `.spec.ts` files |
| 7c | Documentation updates: CLAUDE.md, API_ROUTE_MAP.md, FRONTEND_ROUTE_MAP.md, DATABASE_SCHEMA.md | Doc files |

---

## 14. Open Items for Later

These are explicitly **out of scope** for this implementation but planned for future phases:

| Item | Description | When |
|------|-------------|------|
| **Queue management from CRM** | Assign extensions to Asterisk queues from CRM UI, auto-derive `isOperator` | Next feature after call reports |
| **Conditional form fields** | Category selection reveals sub-fields (field show rules) | After testing base categories |
| **General Telephony section** | Separate admin view for all calls (internal, external, all depts) | After scoped permissions are stable |
| **Permission Preview tool** | Admin tool: "Select employee → see what they can access" | After scoped permissions |
| **Messenger call button** | Click-to-call from internal messenger via softphone bridge | Future |
| **Call Center vs Telephony sidebar split** | Separate menu items for CC operations vs telephony admin | With general telephony section |
| **Full category list** | Complete list of all call report categories (user to provide) | Before production launch |
