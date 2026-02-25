# CRM Backend Performance Audit Report

**Date:** 2026-02-24
**Scope:** Full backend — database schema, query patterns, service layer, controllers, infrastructure
**Stack:** NestJS + Prisma ORM + PostgreSQL
**Models:** 85 | **Services:** 54 | **Controllers:** 33 | **Endpoints:** ~120

> This report is read-only analysis. No code or schema changes have been made.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Risky Queries and Endpoints](#2-risky-queries-and-endpoints)
3. [N+1 Query Risks](#3-n1-query-risks)
4. [Missing Database Indexes](#4-missing-database-indexes)
5. [Suggested Query Optimizations](#5-suggested-query-optimizations)
6. [Schema Risks for Large Datasets](#6-schema-risks-for-large-datasets)
7. [Pagination Enforcement Audit](#7-pagination-enforcement-audit)
8. [Memory and Unbounded Data Loading](#8-memory-and-unbounded-data-loading)
9. [Missing Transaction Safety](#9-missing-transaction-safety)
10. [Caching Analysis and Recommendations](#10-caching-analysis-and-recommendations)
11. [Infrastructure Gaps](#11-infrastructure-gaps)
12. [Suggested Indexes with Reasoning](#12-suggested-indexes-with-reasoning)
13. [Priority Matrix](#13-priority-matrix)

---

## 1. Executive Summary

The CRM backend is a well-structured NestJS application with 85 Prisma models. The schema is well-indexed overall — nearly every foreign key has a dedicated index, and several composite indexes show good query-pattern awareness. However, the service layer has **systemic performance risks** that will degrade under load:

| Category | Count | Severity |
|----------|-------|----------|
| N+1 query patterns | 18 | Critical |
| Unbounded list endpoints (no pagination) | 16 | Critical |
| Paginated endpoints with no max limit | 7 | High |
| Missing transactions on multi-step writes | 14 | Critical (data integrity) |
| In-memory aggregations that should be SQL | 8 | High |
| Heavy include trees reused everywhere | 4 | High |
| Missing rate limiting | Global | High |
| Zero caching layer | Global | High |
| Unauthenticated data-exposing endpoints | 12 | Critical (security) |

### Top 5 Urgent Risks

1. **Inventory stock mutations** (`deductStockForWorkOrder`, `receivePurchaseOrder`) — nested N+1 with no transaction. Concurrent requests **will corrupt stock balances**.
2. **Workflow scheduler** — fires every 5 minutes with no concurrency guard, triggering nested N+1 loops that can generate 1000+ queries per tick.
3. **16 endpoints return unbounded datasets** — `GET /v1/employees`, `GET /v1/clients`, `GET /buildings`, etc. load entire tables with relation includes.
4. **Zero caching** — no Redis, no in-memory cache, no HTTP cache headers. Every request hits the database.
5. **12 unauthenticated endpoints** expose building, client, asset, and incident data to the public internet.

---

## 2. Risky Queries and Endpoints

### 2.1 Endpoints That Will Degrade Under Load

| Endpoint | Service Method | Risk | Explanation |
|----------|---------------|------|-------------|
| `GET /v1/employees` | `employees.findAll` | **CRITICAL** | Returns ALL employees with 5 relation includes. No pagination. Case-insensitive `contains` search on unindexed computed patterns. |
| `GET /v1/clients` | `clients.listDirectory` | **CRITICAL** | Returns ALL clients with `clientBuildings -> building` join. No pagination. In-memory `.map()` transformation. |
| `GET /buildings` | `buildings.list` | **CRITICAL** | Returns ALL buildings with `_count` on 3 relations. No pagination. Unauthenticated. |
| `GET /buildings/statistics/summary` | `buildings.getStatistics` | **HIGH** | Loads ALL buildings into memory, groups by year/month in JavaScript. Should be SQL `GROUP BY`. |
| `GET /v1/work-orders/my-tasks` | `workOrders.getWorkOrdersForEmployee` | **CRITICAL** | Loads ALL assignments + ALL notified work orders, each with 5 nested includes. No pagination. |
| `GET /v1/messenger/conversations` | `messenger.getConversations` | **HIGH** | Properly paginated, but fires a separate `COUNT(*)` query per conversation for unread counts (N+1). |
| `GET /v1/messenger/unread-count` | `messenger.getUnreadCount` | **HIGH** | Sequential `COUNT(*)` per conversation. User in 50 conversations = 50 sequential DB round-trips. |
| `GET /v1/telephony/stats/overview` | `telephonyStats.computeOverviewKpis` | **HIGH** | Loads ALL call sessions for date range into memory. Computes counts, averages, percentiles, peak-hour distributions in JavaScript. |
| `GET /v1/telephony/stats/agents` | `telephonyStats.getAgentStats` | **HIGH** | Same pattern — loads all sessions, aggregates per-agent in a `Map`. |
| `GET /v1/telephony/stats/queues` | `telephonyStats.getQueueStats` | **HIGH** | Same pattern — per-queue aggregation in memory. |
| `GET /v1/sales/leads/:id` | `leads.findOne` | **HIGH** | Loads ALL notes, ALL reminders, ALL appointments, ALL stage history with no limits. Long-lived leads accumulate hundreds of entries. |
| `GET /v1/sales/plans/team-dashboard` | `salesPlans.getTeamDashboard` | **HIGH** | Calls `getMyProgress` per employee (3 queries each) + duplicate lead query inside each call. |
| `GET /v1/client-intelligence/:id/profile` | `clientMetrics.compute*` | **HIGH** | 3 sub-methods each load unbounded datasets (calls, chats, incidents over 180 days) and aggregate in memory. |
| `GET /v1/client-intelligence/:id/timeline` | `activityTimeline.getTimeline` | **MEDIUM** | Loads up to 600 records (200 calls + 200 chats + 200 incidents), merges in memory, paginates with `.slice()`. |
| `POST /v1/work-orders/bulk-delete` | `workOrders.bulkRemove` | **HIGH** | Accepts unbounded `ids[]` array. Calls `remove()` in a loop, each triggering the massive `findOne` include tree. |
| `POST /v1/telephony/events` | `telephonyIngestion.ingestBatch` | **HIGH** | Sequential event processing — 4-8 queries per event with no batching or parallelism. |

### 2.2 Heavy Include Trees (Reused Excessively)

These `findOne` methods load massive relation trees and are called by many other methods that only need a few fields:

| Method | Relations Loaded | Called By |
|--------|-----------------|-----------|
| `workOrders.findOne` | building, asset, workOrderAssets.asset, assignments.employee, productUsages.product+batch, deactivatedDevices.product, notifications.employee, parentWorkOrder, childWorkOrders (10 relations) | `submitProductUsage`, `submitDeactivatedDevices`, `requestRepairConversion`, `submitCompletion`, `approveWorkOrder`, `getInventoryImpact`, `remove`, `getActivityLogs`, `logTaskViewed` |
| `employees.findOne` | user, department, position.department, role.permissions.permission, manager, workOrderAssignments.workOrder.building (3-level deep) | `update`, `remove`, `resetPassword`, `dismiss`, `activate`, `delegateItems`, `hardDelete` |
| `leads.findOne` | stage, source, responsibleEmployee, createdBy, services.service, notes.createdBy, reminders.createdBy, appointments.createdBy, stageHistory.fromStage+toStage+changedBy (10+ relations, all unbounded) | `addService` (in loop during create), `changeStage`, `submitForApproval`, `approveLead`, `unlockLead`, `cancelLead` |

---

## 3. N+1 Query Risks

### 3.1 Critical N+1 Patterns

| Location | Pattern | Impact |
|----------|---------|--------|
| **`inventory.deductStockForWorkOrder`** | Nested loop: for each item → findProduct + findBatches → for each batch → update + create + update | Items × Batches × 3 queries. With 5 items and 3 batches each = 45+ queries. |
| **`inventory.receivePurchaseOrder`** | Loop: for each PO item → create batch + find product + update product + create transaction | 4 queries × number of items. |
| **`workflowTriggerEngine.evaluateInactivityTriggers`** | Nested: for each trigger → findMany(workOrders) → for each workOrder → findUnique + create + executeTriggerActions | Triggers × WorkOrders × (3+N) queries. Runs every 5 min. |
| **`workflowTriggerEngine.evaluateDeadlineTriggers`** | Identical pattern to above. | Same multiplication. |
| **`messenger.getConversations`** | `Promise.all` map: for each conversation → `message.count()` | 1 COUNT per conversation per page (20 extra queries at page size 20). |
| **`messenger.getUnreadCount`** | Sequential loop: for each participation → `message.count()` | 1 COUNT per conversation, all sequential. 50 conversations = 50 round-trips. |
| **`workOrders.create`** | Loop: for each assetId → `assets.internalId()` + `asset.findUnique()` | 2 queries per asset. |
| **`workOrders.submitProductUsage`** | Loop: for each usage → `inventoryProduct.findUnique()` | 1 query per product + second `findOne` at end. |
| **`workOrders.submitDeactivatedDevices`** | Loop: for each device → `inventoryProduct.findUnique()` | 1 query per device. |
| **`workOrders.bulkRemove`** | Loop: for each id → `remove()` → `findOne()` (massive include) | Full entity graph load × number of IDs. |
| **`leads.create`** (with services) | Loop: for each serviceId → `addService()` → `findOne()` (heavy) + validate + create + recalculate + log | 4+ queries × number of services. |
| **`salesPlans.getTeamDashboard`** | `Promise.all` map: for each employee → `getMyProgress()` (3 queries) | 3 queries × team size. 20 employees = 60 queries. |
| **`telephonyIngestion.ingestBatch`** | Sequential: for each event → findUnique + findUnique + create + dispatch(2-8 queries) | 4-8 queries × events in batch. |
| **`notification.send`** | Sequential: for each employee → sendEmail/SMS + create log | 2 I/O ops × recipients. Network-latency amplified. |
| **`workOrdersNotifications.dispatchExternalNotifications`** | Sequential: for each employeeId → `markAsNotified` (findUnique + update) | 2 queries × employees. |
| **`workOrderActivity.log*` methods** | 13 methods each do an employee `findUnique` for name resolution, sometimes redundantly with the caller. | 1-2 extra queries per activity log call. |
| **`translations.seedFromJson`** | Loop: for each key → findUnique + create/update | 2 queries × translation keys (potentially hundreds). |
| **`departments.findUniqueCode`** | `while(true)` loop → findUnique per iteration | 1 query per collision. Unbounded. |

---

## 4. Missing Database Indexes

The schema is well-indexed overall. These are the gaps found:

| Table | Column(s) | Why Needed |
|-------|-----------|------------|
| `DeactivatedDevice` | `stockTransactionId` | FK column used to link back to `StockTransaction`. Queries filtering by transaction will full-scan. |
| `StockTransaction` | `batchId` | FK column to `StockBatch`. "Show transactions for batch X" requires this. |
| `WorkOrderAssignment` | `assignedBy` | Used in audit/reporting queries. Minor unless heavily filtered. |
| `CallMetrics` | (no indexes beyond unique `callSessionId`) | If metrics are queried independently (e.g., "calls with wait time > 60s"), composite indexes on metric columns would help. Currently acceptable since queries go through `CallSession` first. |

> **Note:** `IncidentAsset` uses `@@id([incidentId, assetId])` — PostgreSQL creates an implicit index on the first column of a composite PK, so `incidentId` queries are covered. The explicit `[assetId]` index is correct.

---

## 5. Suggested Query Optimizations

### 5.1 Replace In-Memory Aggregation with SQL

| Current | Location | Suggested |
|---------|----------|-----------|
| Load all buildings, group by year/month in JS | `buildings.getStatistics` | Use `prisma.building.groupBy({ by: [...], _count: true })` or raw SQL `SELECT date_trunc('month', "createdAt"), COUNT(*) GROUP BY 1` |
| Load all call sessions, compute KPIs in JS | `telephonyStats.computeOverviewKpis` | Use `prisma.callSession.groupBy` + `aggregate` for counts/averages. Use raw SQL `PERCENTILE_CONT` for percentiles. |
| Load all sessions, aggregate per-agent in Map | `telephonyStats.getAgentStats` | `GROUP BY "assignedUserId"` with `_count`, `_avg` on metrics. |
| Load all sessions, aggregate per-queue in Map | `telephonyStats.getQueueStats` | `GROUP BY "queueId"` with `_count`, `_avg`. |
| Load all products + batches, sum values in loops | `inventory.getInventoryValue` | Raw SQL `SELECT SUM(remaining_quantity * purchase_price) FROM stock_batches WHERE remaining_quantity > 0`. |
| Load all lead services, sum prices in JS | `leads.updateLeadPricingTotals` | `prisma.leadService.aggregate({ _sum: { monthlyPrice: true, oneTimePrice: true } })`. |
| Load all client calls/chats/incidents, count in JS | `clientMetrics.compute*` | Use `prisma.*.count()` and `prisma.*.aggregate()` for each metric type. |
| Fetch employee IDs just to count them | `departments.findAll`, `departments.getHierarchy` | Use `_count: { select: { employees: { where: ... } } }` instead of loading IDs. |

### 5.2 Replace N+1 Loops with Bulk Operations

| Current | Location | Suggested |
|---------|----------|-----------|
| Loop over assets with `findUnique` per item | `workOrders.create` | Single `findMany({ where: { coreId: { in: assetIds } } })` |
| Loop over products with `findUnique` per item | `workOrders.submitProductUsage` | Single `findMany({ where: { id: { in: productIds } } })` + validate all at once. |
| Loop over products with `findUnique` per item | `workOrders.submitDeactivatedDevices` | Same bulk pattern. |
| Sequential `COUNT` per conversation for unread | `messenger.getConversations` | Raw SQL with conditional count: `SELECT conversation_id, COUNT(*) FILTER (WHERE created_at > last_read_at) FROM messages GROUP BY 1` |
| Sequential `COUNT` per conversation for global unread | `messenger.getUnreadCount` | Same raw SQL approach, single query for all conversations. |
| `findUnique` + `create/update` per translation key | `translations.seedFromJson` | Use `prisma.translation.upsert()` per key (1 query instead of 2), or batch via `$transaction([...upserts])`. |
| `remove()` in loop for bulk delete | `workOrders.bulkRemove` | Batch delete with `deleteMany({ where: { id: { in: ids } } })` after validating statuses in bulk. |
| Per-employee `getMyProgress` (3 queries) | `salesPlans.getTeamDashboard` | Fetch all plans + all won leads + all won lead services in 3 bulk queries, then join in memory. |
| Per-employee `markAsNotified` | `workOrdersNotifications.dispatchExternalNotifications` | Single `updateMany({ where: { workOrderId, employeeId: { in: employeeIds } } })`. |

### 5.3 Parallelize Independent Queries

| Current | Location | Suggested |
|---------|----------|-----------|
| Sequential: department → role → manager → position validation | `employees.update` | `Promise.all([findDept, findRole, findManager, findPosition])` |
| Sequential: client → lead → workOrders → recentCalls | `telephonyCalls.lookupPhone` | `Promise.all([findClient, findLead, findRecentCalls])`, then conditional WO query. |
| Sequential: evaluateInactivity → evaluateDeadline | `workflowTriggerEngine.evaluateTimeBased` | `Promise.all([evaluateInactivity(), evaluateDeadline()])` |
| Sequential: email send → SMS send | `workOrdersNotifications.dispatchExternal` | `Promise.allSettled([sendEmail(), sendSMS()])` |

### 5.4 Reduce Include Tree Scope

| Method | Current | Suggested |
|--------|---------|-----------|
| `workOrders.findOne` | 10 relations always loaded | Create lightweight variants: `findOneBasic` (building + asset only), `findOneWithProducts` (adds productUsages), etc. Callers use the variant they need. |
| `employees.findOne` | Role → permissions → permission + all WO assignments | Remove `workOrderAssignments` include from default. Load only when displaying employee detail page. |
| `leads.findOne` | All notes + reminders + appointments + stage history unbounded | Add `take: 20` on sub-collections. Paginate notes/reminders/appointments separately. |
| `incidents.list` | `include: { building: true, client: true }` | Use `select` to pick only needed fields: `building: { select: { id, name } }`. |

---

## 6. Schema Risks for Large Datasets

### 6.1 High-Growth Append-Only Tables

These tables grow continuously and have no retention/archival strategy:

| Table | Growth Driver | Columns of Concern | Risk |
|-------|--------------|---------------------|------|
| **AuditLog** | Every create/update/delete across the system | `payload` (Json, unbounded) | Will become the largest table. No TTL, no partitioning. Queries by `[entity, entityKey]` composite index will slow as table grows into millions. |
| **WorkOrderActivityLog** | Every work order lifecycle event | `description` (unbounded text), `metadata` (Json) | Linear growth with work order volume. |
| **CallEvent** | Every raw telephony event | `payload` (Json, raw PBX data) | High-frequency ingestion. A busy call center generates thousands of events/day. |
| **ClientChatMessage** | Every chat message across all channels | `text` (unbounded), `attachments` (Json), `rawPayload` (Json) | Three potentially large columns per row. `rawPayload` stores raw webhook data. |
| **NotificationLog** | Every email/SMS sent | `body` (unbounded text) | Stores full rendered notification body per send. |
| **LeadActivity** | Every lead interaction | `previousValues`, `newValues`, `changedFields`, `metadata` (4 Json columns) | 4 Json blobs per activity entry. |
| **StockTransaction** | Every inventory movement | — | Growth proportional to work order volume. |
| **SyncEvent** | Every webhook from core system | `payload` (Json) | Raw webhook payloads stored permanently. |

**Recommendation:** Implement table partitioning by `createdAt` (monthly or quarterly) for `AuditLog`, `CallEvent`, `ClientChatMessage`, and `NotificationLog`. Add data retention policies for tables storing raw payloads.

### 6.2 Unbounded Json Columns

| Table | Column | Concern |
|-------|--------|---------|
| `LeadActivity` | `previousValues`, `newValues`, `changedFields`, `metadata` | 4 Json blobs per row. If a lead has 50+ columns changed, each Json could be large. |
| `LeadProposal` | `servicesSnapshot` | Full service catalog snapshot per proposal. Will grow if service catalog grows. |
| `Lead` | `contactPersons` | Json array of contact objects. No schema validation, could grow unbounded. |
| `CallEvent` | `payload` | Raw PBX event payloads. Varies in size. |
| `ClientChatMessage` | `rawPayload` | Raw webhook data from Viber/Facebook. Can include media metadata. |
| `WorkflowTrigger` | `condition` | Json condition tree. Typically small but no validation. |
| `WorkflowTriggerAction` | `targetPositionIds` | Json array. No length limit. |

### 6.3 Soft Delete Inconsistency

Three patterns exist in the schema:

| Pattern | Tables | Concern |
|---------|--------|---------|
| `deletedAt` + `isActive` (redundant) | Building, Client, Asset | Double state tracking. Queries must check both. |
| `isActive` flag only | User, Department, Role, Position, ~15 others | Simpler but no timestamp trail. |
| Status enum (e.g., `TERMINATED`, `CANCELLED`) | Employee, WorkOrder, Lead, MissedCall | Domain-appropriate but inconsistent with above. |

**Risk:** Queries that filter by `isActive` but forget `deletedAt` (or vice versa) will return stale data. Standardize on one pattern.

### 6.4 Denormalized Name Fields

Multiple models store cached names alongside FK references:

- `WorkOrderActivityLog.performedByName` + `performedById`
- `Lead.createdByName` + `createdById`
- `Lead.responsibleEmployeeName` + `responsibleEmployeeId`
- `LeadNote.createdByName`, `LeadReminder.createdByName`, `LeadAppointment.createdByName`, `LeadProposal.createdByName`
- `LeadStageHistory.changedByName`
- `SalesPlan.createdByName`

**Risk:** Names go stale if an employee's name changes. This is an intentional trade-off (avoids joins for display), but there's no mechanism to propagate name updates.

---

## 7. Pagination Enforcement Audit

### 7.1 Endpoints With NO Pagination (Return ALL Records)

| # | Endpoint | Auth | Relations Loaded |
|---|----------|------|-----------------|
| 1 | `GET /v1/employees` | JWT | user, department, position.department, role, manager |
| 2 | `GET /v1/departments` | JWT | head, employees, parent |
| 3 | `GET /v1/departments/hierarchy` | JWT | 3-level deep children with employees at each level |
| 4 | `GET /buildings` | **NONE** | _count on 3 relations |
| 5 | `GET /v1/buildings` | **NONE** | Same as above |
| 6 | `GET /v1/clients` | **NONE** | clientBuildings.building |
| 7 | `GET /v1/buildings/:id/clients` | **NONE** | None |
| 8 | `GET /v1/buildings/:id/assets` | **NONE** | None |
| 9 | `GET /v1/clients/:clientId/incidents` | **NONE** | building, client, reportedBy, incidentAssets |
| 10 | `GET /v1/buildings/:buildingId/incidents` | **NONE** | Same |
| 11 | `GET /v1/inventory/purchase-orders` | JWT | items.product |
| 12 | `GET /v1/inventory/deactivated-devices` | JWT | product, workOrder.building |
| 13 | `GET /v1/translations` | JWT | None |
| 14 | `GET /v1/translations/map` | JWT | None (but full in-memory transform) |
| 15 | `GET /v1/work-orders/my-tasks` | JWT | 5 nested includes × 2 queries |
| 16 | `GET /v1/work-orders/notifications` | JWT | employee |
| 17 | `GET /v1/sales/plans` | JWT | employee, createdBy, targets.service |
| 18 | `GET /v1/messenger/search/employees` | JWT | None |
| 19 | `GET /v1/messenger/search/messages` | JWT | None |

### 7.2 Paginated Endpoints Without Max Limit Enforcement

These endpoints accept pagination parameters but have no `@Max()` validator, allowing clients to request all records:

| Endpoint | Parameter | Default | Max Enforced |
|----------|-----------|---------|-------------|
| `GET /v1/inventory/products` | `pageSize` | 50 | **None** — `parseInt` only |
| `GET /v1/inventory/transactions` | `limit` | 100 | **None** — `parseInt` only |
| `GET /v1/work-orders` | `pageSize` | 10 | **None** — `@Min(1)` only |
| `GET /v1/sales/leads` | `pageSize` | 20 | **None** — `@Min(1)` only |
| `GET /v1/incidents` | `pageSize` | — | **None** |
| `GET /v1/clientchats/conversations` | `limit` | — | **None** — `@Min(1)` only |
| `GET /v1/client-intelligence/:id/timeline` | `limit` | 50 | **None** — `ParseIntPipe` only |
| `GET /v1/admin/notifications/logs` | `limit` | — | **None** |
| `GET /v1/telephony/callbacks` | `pageSize` | — | **None** |

### 7.3 Properly Paginated Endpoints (Good Examples)

| Endpoint | Max Limit | Implementation |
|----------|-----------|----------------|
| `GET /v1/telephony/calls` | 100 | `@Max(100)` in DTO |
| `GET /v1/telephony/quality/reviews` | 100 | `@Max(100)` in DTO |
| `GET /v1/messenger/conversations` | 50 | `@Max(50)` in DTO + cursor-based |
| `GET /v1/messenger/conversations/:id/messages` | 100 | `@Max(100)` in DTO + cursor-based |
| `GET /v1/integrations/core/events` | 100 | `Math.min(Math.max(...), 100)` in service |

---

## 8. Memory and Unbounded Data Loading

### 8.1 In-Memory Aggregations on Full Datasets

| Service | Method | What It Loads | What It Computes in JS |
|---------|--------|--------------|----------------------|
| `buildings.getStatistics` | ALL buildings | Monthly counts via year/month grouping |
| `telephonyStats.computeOverviewKpis` | ALL call sessions for date range | Counts, averages, percentiles, SLA %, peak-hour distribution |
| `telephonyStats.getAgentStats` | ALL sessions for date range | Per-agent counts, averages, handle times |
| `telephonyStats.getQueueStats` | ALL sessions for date range | Per-queue counts, averages, wait times |
| `inventory.getInventoryValue` | ALL active products with ALL stock batches | Total inventory value via nested loops |
| `clientMetrics.computeCallMetrics` | ALL call sessions for a client (180 days) | Call counts, durations, averages |
| `clientMetrics.computeIncidentMetrics` | ALL incidents for a client | Status counts, priority breakdown |
| `clientMetrics.computeChatMetrics` | ALL chat conversations for a client | Channel counts, status counts |
| `salesPlans.getMyProgress` | ALL won lead services + ALL won leads | Per-service revenue aggregation (also duplicates the lead query) |
| `activityTimeline.getTimeline` | Up to 600 records (200 calls + 200 chats + 200 incidents) | Cross-type merge sort, then `.slice()` for pagination |

### 8.2 Unbounded Array Inputs

| Endpoint | Body Field | Risk |
|----------|-----------|------|
| `POST /v1/work-orders/bulk-delete` | `ids[]` | No size limit. Each ID triggers full `findOne` + `remove`. |
| `POST /v1/work-orders/:id/products` | Array of product usages | No size limit. N+1 validation per product. |
| `POST /v1/work-orders/:id/deactivated-devices` | Array of devices | No size limit. N+1 validation per device. |
| `POST /v1/telephony/events` | Array of events | No size limit. 4-8 queries per event sequentially. |
| `POST /v1/admin/notifications/send` | Employee recipients | No explicit size limit on recipient list. |

---

## 9. Missing Transaction Safety

These operations perform multiple sequential writes without `$transaction`, risking data inconsistency on failure:

| Priority | Location | Operations Without Transaction | Data Risk |
|----------|----------|-------------------------------|-----------|
| **P0** | `inventory.deductStockForWorkOrder` | N × (batch update + transaction create + product update) | **Stock balance corruption** — partial deduction leaves inventory in inconsistent state. Race conditions between concurrent requests. |
| **P0** | `inventory.receivePurchaseOrder` | N × (batch create + product find + product update + transaction create) | **Stock balance corruption** on partial receive. |
| **P0** | `employees.hardDelete` | 12+ `updateMany` calls (leads, notes, reminders, appointments, proposals, stage history, sales plans, activity logs, departments) + user delete + employee delete | Partial cleanup leaves orphaned references. |
| **P1** | `workOrders.approveWorkOrder` | Delete old product usages, create new ones, deduct stock, log activity, change status | Approved WO with failed stock deduction = phantom approval. |
| **P1** | `workOrders.assignEmployees` | `createMany` assignments + activity logs + status change + WO update | Partial assignment state. |
| **P1** | `messenger.sendMessage` | message create + conversation update (lastMessageAt) + participant updateMany | Message exists but conversation timestamp not updated. |
| **P2** | `leads.changeStage` | lead update + stage history create + activity log | Stage changed but no history record. |
| **P2** | `leads.submitForApproval` | lead update (lock) + stage history + activity log | Locked lead with no history trail. |
| **P2** | `leads.approveLead` / `unlockLead` / `cancelLead` | lead update + stage history + activity log | Same pattern. |
| **P2** | `salesPlans.create` / `update` | deleteMany targets + createMany targets | **Delete-then-create anti-pattern.** If create fails, targets are gone. |
| **P2** | `workflow.setStepPositions` | deleteMany positions + createMany positions | Same delete-then-create risk. |
| **P2** | `telephonyIngestion.handleCallEnd` | session update + close legs + compute metrics + handle callback | Partial call completion state. |
| **P3** | `employees.update` | Up to 5 separate `user.update` calls + `employee.update` | Minor inconsistency risk. |
| **P3** | `employees.dismiss` / `activate` | employee update + user update | Minor. |

### Race Condition: Inventory PO Number Generation

```typescript
// inventory.service.ts — createPurchaseOrder
const count = await this.prisma.purchaseOrder.count();
const poNumber = `PO-${year}-${String(count + 1).padStart(3, '0')}`;
```

This count-then-format is non-atomic. Two concurrent `createPurchaseOrder` calls will generate the same PO number, causing a unique constraint violation.

---

## 10. Caching Analysis and Recommendations

### 10.1 Current State

| Component | Status |
|-----------|--------|
| Application-level cache (NestJS `CacheModule`) | **Not installed** |
| Redis | **Not installed** |
| Bull/BullMQ job queues | **Not installed** |
| HTTP caching headers (`Cache-Control`, `ETag`) | **Not configured** |
| In-memory caching (LRU, memoization) | **None** |
| Pre-computation / cache warming | **None** |

Every database query hits PostgreSQL on every request. There is zero caching anywhere in the stack.

### 10.2 Where Caching Would Have High Impact

| Data | Access Pattern | Staleness Tolerance | Recommended Cache |
|------|---------------|---------------------|-------------------|
| **Permissions / RBAC resolution** | `GET /auth/me` and `PositionPermissionGuard` run on every authenticated request (3 DB queries for `/me`, 2 for the guard). | 1-5 minutes | **Redis** with key `permissions:{employeeId}`. Invalidate on role/position change. Highest ROI cache in the system. |
| **Translations** | `GET /v1/translations/map` loads ALL translations every time. Used on every page load. | Minutes to hours (changes are admin-driven). | **Redis** or in-memory with key `translations:map`. Invalidate on create/update/seed. |
| **System lists** (categories + items) | Loaded frequently for form dropdowns. Rarely changes. | Hours | **In-memory** TTL cache. Invalidate on admin update. |
| **Buildings list** | `GET /buildings` loads all buildings. Changes infrequently. | 1-5 minutes | **Redis** with key `buildings:list`. Invalidate on sync webhook. |
| **Workflow steps + triggers** | Configuration data loaded for every work order state transition. | Minutes | **In-memory** or Redis. Invalidate on admin config change. |
| **Telephony stats** | `GET /v1/telephony/stats/*` computes aggregations on every request. | 1-5 minutes (dashboard refresh interval). | **Redis** with TTL. Key: `telephony:stats:{type}:{dateRange}`. Pre-compute on schedule or cache-on-read with TTL. |
| **Department hierarchy** | `GET /v1/departments/hierarchy` does 3-level nested query. Changes rarely. | Minutes | **Redis** with key `departments:hierarchy`. Invalidate on dept create/update/delete. |
| **Employee directory** | `GET /v1/employees` loads all employees. Used in assignment dropdowns. | 1-2 minutes | **Redis** with key `employees:list:{filterHash}`. Invalidate on employee change. |

### 10.3 Where a Job Queue Would Help

| Current Synchronous Work | Impact | Recommended |
|-------------------------|--------|-------------|
| Email/SMS sending in request cycle | Blocks HTTP response until SMTP/API call completes. Timeout risk. | **BullMQ** job queue with Redis. Enqueue `sendEmail`/`sendSMS` jobs, process asynchronously with retry. |
| Workflow trigger evaluation (every 5 min) | Generates 100s of queries in scheduler. No concurrency guard. | **BullMQ** scheduled job with distributed lock (Bull's built-in). Process triggers as individual jobs. |
| Telephony event ingestion | Sequential processing blocks the webhook response. | **BullMQ** queue. Enqueue events, process in workers with concurrency control. |
| Audit log writes | Synchronous insert on every CUD operation. | **BullMQ** queue. Fire-and-forget audit logging without blocking the main request. |
| Work order notification dispatch | Sequential per-employee email + SMS. | Enqueue as batch job. Process with controlled concurrency. |

---

## 11. Infrastructure Gaps

| Missing Component | Impact | Priority |
|-------------------|--------|----------|
| **Rate limiting** (`@nestjs/throttler`) | Every endpoint vulnerable to abuse/DDoS. Public endpoints especially exposed. | **P0** |
| **Health check** (`@nestjs/terminus`) | No `/health` endpoint for load balancers, orchestrators, or monitoring. | **P1** |
| **Request logging middleware** | No HTTP request/response logging (method, URL, status, duration). Impossible to identify slow endpoints in production. | **P1** |
| **Response compression** (gzip/brotli) | Large JSON payloads sent uncompressed. | **P2** |
| **Helmet** (security headers) | No `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`. | **P2** |
| **Body size limits** | Relying on Express default (~100kb). No explicit control for upload or bulk endpoints. | **P2** |
| **Structured logging** (Pino/Winston) | Using NestJS built-in `Logger`. No JSON log format for log aggregation. | **P3** |
| **Response serialization** | No `ClassSerializerInterceptor`. Internal fields (all Prisma columns) are returned as-is. | **P3** |
| **Debug `console.log` in production** | `PermissionsController` logs user emails via `console.log`. | **P1** (security) |

---

## 12. Suggested Indexes with Reasoning

### 12.1 New Indexes to Add

| Table | Index | Reasoning |
|-------|-------|-----------|
| `DeactivatedDevice` | `@@index([stockTransactionId])` | FK column referenced when querying "which devices came from this stock transaction". Without it, a sequential scan is required. |
| `StockTransaction` | `@@index([batchId])` | FK column to `StockBatch`. Needed for "show all transactions for batch X" queries during PO reconciliation. |
| `AuditLog` | `@@index([createdAt])` | Currently only has `[entity, entityKey]` and `[actorId]` indexes. Time-range queries on the audit log (which will be the largest table) need this. |
| `NotificationLog` | `@@index([recipientId, createdAt])` | Composite for "recent notifications for employee X" queries. The individual `[recipientId]` index exists but the composite avoids a sort operation. |
| `WorkOrderActivityLog` | `@@index([workOrderId, createdAt])` | Composite for the common "get activity for WO sorted by time" query. Individual indexes exist but a composite is more efficient for this paired access pattern. |
| `LeadActivity` | `@@index([leadId, createdAt])` | Same reasoning — activity is always queried by lead and sorted by time. |

### 12.2 Indexes That Already Exist and Are Correct

The schema already has good composite indexes in key places:

- `Message` — `@@index([conversationId, createdAt(sort: Desc)])` (messages by conversation, newest first)
- `ClientChatMessage` — `@@index([conversationId, sentAt(sort: Desc)])` (same pattern)
- `CallSession` — `@@index([queueId, startAt])`, `@@index([assignedUserId, startAt])` (stats queries)
- `StockTransaction` — `@@index([productId, createdAt])` (product history)
- `ConversationParticipant` — `@@index([employeeId, isArchived])` (inbox query)
- `Conversation` — `@@index([lastMessageAt(sort: Desc)])` (recent conversations)

### 12.3 Indexes NOT Recommended

| Suggestion | Why Not |
|-----------|---------|
| Index on `Employee.firstName` / `lastName` | The search uses `contains` (LIKE '%term%') which cannot use a B-tree index. Use PostgreSQL `pg_trgm` + GIN index if full-text search is needed, but that's a schema change. |
| Index on every Json column | PostgreSQL supports GIN indexes on jsonb, but the queries don't filter inside Json — they load the whole column. No benefit. |
| Index on `WorkOrderAssignment.assignedBy` | Low-frequency audit queries. The cost of maintaining the index on every insert outweighs the benefit. |

---

## 13. Priority Matrix

### P0 — Fix Before Production / Scale

| # | Issue | Category | Impact |
|---|-------|----------|--------|
| 1 | `inventory.deductStockForWorkOrder` — no transaction, nested N+1 | Transaction + N+1 | Stock data corruption |
| 2 | `inventory.receivePurchaseOrder` — no transaction, N+1 | Transaction + N+1 | Stock data corruption |
| 3 | `employees.hardDelete` — 12+ writes, no transaction | Transaction | Orphaned data on failure |
| 4 | 12 unauthenticated endpoints expose data publicly | Security | Data breach |
| 5 | Zero rate limiting on all endpoints | Security | DDoS / abuse |
| 6 | Workflow scheduler — no concurrency guard, triggers N+1 cascades every 5 min | Scheduler + N+1 | DB overload in production |
| 7 | `AdminManualController` — body typed as `any`, bypasses validation | Security | Arbitrary data injection |

### P1 — Fix Before Scaling Beyond Pilot

| # | Issue | Category | Impact |
|---|-------|----------|--------|
| 8 | 16 list endpoints with no pagination | Pagination | OOM / timeout under data growth |
| 9 | 7 paginated endpoints with no max limit | Pagination | Client can bypass pagination |
| 10 | `workOrders.approveWorkOrder` — no transaction on stock + status | Transaction | Phantom approvals |
| 11 | `messenger.getUnreadCount` — sequential N+1 COUNT per conversation | N+1 | Linear slowdown with conversation count |
| 12 | Telephony stats — full dataset in-memory aggregation | Memory | OOM with call volume growth |
| 13 | Permissions/RBAC — 2-3 DB queries per request, no caching | Caching | DB load amplified by request volume |
| 14 | `leads.findOne` — loads all sub-entities unbounded | Query | Slow response for mature leads |
| 15 | `workOrders.findOne` — 10-relation include tree reused by 9+ methods | Query | Unnecessary data loading on every operation |
| 16 | Add Redis + cache layer for translations, permissions, config data | Caching | Reduces DB load 30-50% |
| 17 | Add BullMQ for email/SMS, audit logging, webhook processing | Async | Unblocks request cycle |
| 18 | Debug `console.log` in PermissionsController | Security | User emails in production logs |
| 19 | Add health check endpoint | Infrastructure | Required for load balancers |

### P2 — Optimization Phase

| # | Issue | Category | Impact |
|---|-------|----------|--------|
| 20 | `buildings.getStatistics` — in-memory grouping | Query | Should be SQL GROUP BY |
| 21 | `clientMetrics.compute*` — in-memory aggregation | Query | Should be SQL COUNT/AVG |
| 22 | `salesPlans.getTeamDashboard` — N+1 per employee | N+1 | 3N queries for team size N |
| 23 | `salesPlans.getMyProgress` — duplicate lead query | Query | Redundant DB load |
| 24 | `telephonyIngestion.ingestBatch` — sequential, no parallelism | N+1 | Webhook response latency |
| 25 | `notification.send` — sequential email/SMS per recipient | N+1 | Notification delivery latency |
| 26 | `translations.seedFromJson` — N+1 upsert per key | N+1 | Slow seed operations |
| 27 | `workOrderActivity.log*` — redundant employee lookups | Query | 1-2 extra queries per log call |
| 28 | Missing indexes (see Section 12.1) | Index | Query performance |
| 29 | Delete-then-create patterns in `salesPlans`, `workflow` | Transaction | Data loss on failure |
| 30 | Inventory PO number generation — race condition | Concurrency | Duplicate PO numbers |

### P3 — Technical Debt / Hardening

| # | Issue | Category | Impact |
|---|-------|----------|--------|
| 31 | Add response compression (gzip/brotli) | Infrastructure | Payload size |
| 32 | Add Helmet security headers | Security | Best practice |
| 33 | Add structured logging (Pino) | Observability | Log aggregation |
| 34 | Add response serialization | Security | Prevent internal field leakage |
| 35 | Standardize soft-delete pattern | Schema | Developer confusion |
| 36 | Add data retention policies for append-only tables | Schema | Storage growth |
| 37 | `departments.findUniqueCode` — unbounded while loop | Query | Edge case DoS |
| 38 | `departments.update` — circular ref check walks parent chain | Query | N queries for N-level hierarchy |
| 39 | WebSocket gateway — in-memory presence only, no Redis pub/sub | Scaling | Cannot scale horizontally |

---

*End of audit. No code or schema changes have been made.*
