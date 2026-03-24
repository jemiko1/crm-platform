# FRONTEND_MAP.md — Frontend Pages & Components

> **Framework**: Next.js 16 (App Router), React 19
> **CSS**: Tailwind CSS v4 (PostCSS plugin, theme in `globals.css`)
> **State**: React hooks (`useState`, `useEffect`, `useMemo`, `useCallback`), React Context for global state
> **API Client**: `src/lib/api.ts` — `apiGet`, `apiPost`, `apiPatch`, `apiPut`, `apiDelete`
> **Last Updated**: 2026-03-24

---

## 1. Pages / Routes (47 total)

### Public Routes

| URL Path | Page File | What User Sees | Data Loaded |
|----------|-----------|----------------|-------------|
| `/` | `app/page.tsx` | Redirect to `/app/dashboard` or `/login` | — |
| `/login` | `app/login/page.tsx` | Login form (email + password) | — |

### Authenticated Routes (`/app/*`)

| URL Path | Page File | What User Sees | Data Loaded | Status |
|----------|-----------|----------------|-------------|--------|
| `/app/dashboard` | `dashboard/page.tsx` | Dashboard with summary cards | Static placeholder (no API) | Placeholder |
| `/app/buildings` | `buildings/page.tsx` | Building list with search/pagination + Add modal | `GET /v1/buildings` | Working |
| `/app/buildings/[buildingId]` | `buildings/[buildingId]/page.tsx` | Building detail (tabbed: overview, devices, clients, WOs, incidents) | Multiple building endpoints | Working |
| `/app/clients` | `clients/page.tsx` | Global client directory | `GET /v1/clients` | Working |
| `/app/clients/[clientId]` | `clients/[clientId]/page.tsx` | Client detail with incidents | Client + incidents endpoints | Working |
| `/app/employees` | `employees/page.tsx` | Employee list with search/status filter | `GET /v1/employees` | Working |
| `/app/employees/[employeeId]` | `employees/[employeeId]/page.tsx` | Employee detail with lifecycle actions | Employee detail + delegation endpoints | Working |
| `/app/work-orders` | `work-orders/page.tsx` | Work order list with filters | `GET /v1/work-orders` | Working |
| `/app/work-orders/[id]` | `work-orders/[id]/page.tsx` | Work order detail modal (detail, activity, workflow) | WO detail + activity endpoints | Working |
| `/app/incidents` | `incidents/page.tsx` | Incident list with filters + report modal | `GET /v1/incidents` | Working |
| `/app/inventory` | `inventory/page.tsx` | Products + Purchase Orders tabs | Multiple inventory endpoints | Working |
| `/app/tasks` | `tasks/page.tsx` | My Workspace (employee's assigned work orders) | `GET /v1/work-orders/my-tasks` | Working |
| `/app/tasks/[taskId]` | `tasks/[taskId]/page.tsx` | Task detail with all workflow actions | WO detail + workflow endpoints | Working |
| `/app/assets` | `assets/page.tsx` | Placeholder (assets via building detail) | — | Placeholder |
| `/app/sales/dashboard` | `sales/dashboard/page.tsx` | Sales overview dashboard | Sales statistics | Working |
| `/app/sales/leads` | `sales/leads/page.tsx` | Sales pipeline with stage filters | `GET /v1/sales/leads` + statistics | Working |
| `/app/sales/leads/[id]` | `sales/leads/[id]/page.tsx` | Lead detail with services, notes, timeline | Full lead detail endpoints | Working |
| `/app/sales/plans` | `sales/plans/page.tsx` | Sales plans management | `GET /v1/sales/plans` | Working |
| `/app/call-center` | `call-center/page.tsx` | Call center main page | — | Working |
| `/app/call-center/live` | `call-center/live/page.tsx` | Live call monitoring | Telephony WebSocket | Working |
| `/app/call-center/logs` | `call-center/logs/page.tsx` | Call history/logs | `GET /v1/telephony/calls` | Working |
| `/app/call-center/agents` | `call-center/agents/page.tsx` | Agent status view | `GET /v1/telephony/agents/live` | Working |
| `/app/call-center/statistics` | `call-center/statistics/page.tsx` | Call analytics with KPIs + charts | `GET /v1/telephony/stats/overview` | Working |
| `/app/call-center/quality` | `call-center/quality/page.tsx` | Quality reviews | Quality review endpoints | Working |
| `/app/call-center/callbacks` | `call-center/callbacks/page.tsx` | Callback request management | Callback endpoints | Working |
| `/app/client-chats` | `client-chats/page.tsx` | Unified inbox (all channels) | `GET /v1/clientchats/conversations` | Working |
| `/app/client-chats/analytics` | `client-chats/analytics/page.tsx` | Chat analytics dashboard | Analytics endpoints | Working |
| `/app/admin` | `admin/page.tsx` | Admin dashboard with section cards | — | Working |
| `/app/admin/positions` | `admin/positions/page.tsx` | Position CRUD | `GET /v1/positions` | Working |
| `/app/admin/role-groups` | `admin/role-groups/page.tsx` | Role group CRUD + permission assignment | Role groups + permissions endpoints | Working |
| `/app/admin/departments` | `admin/departments/page.tsx` | Department hierarchy (tree + org chart) with drag-drop | Department + employee endpoints | Working |
| `/app/admin/roles` | `admin/roles/page.tsx` | Legacy roles (read-only) | `GET /v1/roles` | Partial |
| `/app/admin/users` | `admin/users/page.tsx` | User management placeholder | — | Placeholder |
| `/app/admin/employees` | `admin/employees/page.tsx` | Admin employee view (duplicate) | Same as `/app/employees` | Partial |
| `/app/admin/list-items` | `admin/list-items/page.tsx` | System list categories | `GET /v1/system-lists/categories` | Working |
| `/app/admin/list-items/[categoryId]` | `admin/list-items/[categoryId]/page.tsx` | Items within a category | Category items endpoint | Working |
| `/app/admin/services` | `admin/services/page.tsx` | Sales services catalog admin | Sales services endpoints | Working |
| `/app/admin/workflow` | `admin/workflow/page.tsx` | Workflow step configuration | Workflow endpoints | Working |
| `/app/admin/translations` | `admin/translations/page.tsx` | i18n translation management | Translation endpoints | Working |
| `/app/admin/notifications` | `admin/notifications/page.tsx` | Notification template management | Notification endpoints | Working |
| `/app/admin/sms-config` | `admin/sms-config/page.tsx` | SMS provider configuration | SMS config endpoints | Working |
| `/app/admin/email-config` | `admin/email-config/page.tsx` | Email SMTP/IMAP configuration | Email config endpoints | Working |
| `/app/admin/telephony-extensions` | `admin/telephony-extensions/page.tsx` | SIP extension management | Telephony extension endpoints | Working |
| `/app/admin/client-chats-config` | `admin/client-chats-config/page.tsx` | Client chat channel configuration | Client chat config endpoints | Working |
| `/app/admin/sales-config` | `admin/sales-config/page.tsx` | Sales pipeline config (stages, positions) | Sales config endpoints | Working |

---

## 2. Key Reusable Components

### Layout Components

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| **AppHeader** | `app-header.tsx` | — | Sticky header with CRM28 logo, search, messenger, notifications, profile |
| **SidebarNav** | `sidebar-nav.tsx` | — | Left navigation with permission-based menu visibility |
| **ProfileMenu** | `profile-menu.tsx` | — | Circular avatar dropdown (settings, logout) |
| **HeaderSearch** | `header-search.tsx` | — | Pill-shaped search bar with Ctrl+K shortcut |
| **HeaderMessengerIcon** | `header-messenger-icon.tsx` | — | Messenger icon with unread badge + dropdown |
| **HeaderNotifications** | `header-notifications.tsx` | — | Notification bell with unread badge + dropdown |
| **HeaderSettings** | `header-settings.tsx` | — | Settings menu (phone app download link) |
| **TasksIcon** | `tasks-icon.tsx` | — | My Workspace link with task count badge |
| **PhoneMismatchBanner** | `phone-mismatch-banner.tsx` | — | Warning banner when desktop phone is disconnected |

### Modal System

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| **ModalDialog** | `app/modal-dialog.tsx` | `open`, `onClose`, `title`, `maxWidth`, `children` | Generic reusable modal wrapper (portal-based) |
| **ModalManager** | `app/app/modal-manager.tsx` | — | Centralized renderer for all entity detail modals |
| **ModalProvider** | `app/app/modal-provider.tsx` | `children` | Suspense boundary wrapper for modals |
| **ModalStackContext** | `app/app/modal-stack-context.tsx` | — | LIFO stack state for stacked detail modals |
| **ModalZIndexContext** | `app/app/modal-z-index-context.tsx` | — | Z-index management utilities |

### Messenger Components

| Component | File | Description |
|-----------|------|-------------|
| **MessengerContext** | `messenger/messenger-context.tsx` | Global React Context: Socket.IO, state, MessageBus |
| **ChatBubble** | `messenger/chat-bubble.tsx` | Bottom-anchored chat window (Facebook-style) |
| **ChatBubbleContainer** | `messenger/chat-bubble-container.tsx` | Manages multiple open chat bubbles |
| **FullMessengerContent** | `messenger/full-messenger-content.tsx` | Three-column full messenger view |
| **MessengerModalBridge** | `messenger/messenger-modal-bridge.tsx` | Bridge between messenger events and modal system |
| **ConversationList** | `messenger/conversation-list.tsx` | Conversation sidebar with filters (All, Groups, Unread) |
| **MessageList** | `messenger/message-list.tsx` | Message list with polling, auto-scroll |
| **MessageItem** | `messenger/message-item.tsx` | Message bubble with reactions, status, seen avatars |
| **MessageInput** | `messenger/message-input.tsx` | Input with emoji picker, typing indicator |
| **CreateGroupDialog** | `messenger/create-group-dialog.tsx` | Permission-gated group creation |

### Client Chats Components

| Component | File | Description |
|-----------|------|-------------|
| **InboxSidebar** | `client-chats/components/inbox-sidebar.tsx` | Conversation list with channel badges |
| **ConversationPanel** | `client-chats/components/conversation-panel.tsx` | Active conversation view |
| **ConversationHeader** | `client-chats/components/conversation-header.tsx` | Conversation header with actions |
| **MessageBubble** | `client-chats/components/message-bubble.tsx` | Chat message bubble |
| **ReplyBox** | `client-chats/components/reply-box.tsx` | Agent reply input |
| **FilterBar** | `client-chats/components/filter-bar.tsx` | Channel/status filters |
| **ChannelBadge** | `client-chats/components/channel-badge.tsx` | Viber/FB/Telegram/WhatsApp badge |
| **ManagerDashboard** | `client-chats/components/manager-dashboard.tsx` | Manager overview panel |

### Shared Components

| Component | File | Description |
|-----------|------|-------------|
| **PermissionButton** | `lib/permission-button.tsx` | Button that auto-hides without permission |
| **PermissionGuard** | `lib/permission-guard.tsx` | Wrapper that hides children without permission |
| **ClickToCall** | `components/click-to-call.tsx` | Phone number click-to-call via desktop app |
| **UserBadge** | `app/app/user-badge.tsx` | User avatar/name badge |
| **LogoutButton** | `app/app/logout-button.tsx` | Logout action button |

---

## 3. State Management

| Mechanism | Scope | Used For |
|-----------|-------|----------|
| **React `useState` / `useEffect`** | Local (per-component) | Form state, loading, errors, fetched data |
| **React `useMemo` / `useCallback`** | Local | Filtered lists, computed values, memoized handlers |
| **React Context (`MessengerContext`)** | Global (app-wide) | Messenger state: conversations, messages, Socket.IO connection, unread counts |
| **React Context (`I18nContext`)** | Global (app-wide) | Current language, translation function |
| **React Context (`ModalStackContext`)** | Global (app-wide) | Entity detail modal stack state |
| **URL query params** | Global (URL-driven) | Detail modal state (`?building=1`, `?client=5`, `?workOrder=123`) |
| **Socket.IO** | Global (real-time) | Messenger messages, typing indicators, telephony events |
| **Module-level cache** | Global (singleton) | Permissions cache in `use-permissions.ts` |

No Redux, Zustand, or other external state library is used. State is managed via React built-ins.

---

## 4. Forms

| Form | Location | Fields | On Submit |
|------|----------|--------|-----------|
| **Login** | `login/page.tsx` | email, password | `POST /auth/login` → redirect to `/app/dashboard` |
| **Add Building** | `buildings/add-building-modal.tsx` | name, address, city | `POST /v1/admin/buildings` |
| **Edit Building** | `buildings/[buildingId]/edit-building-modal.tsx` | name, address, city | `PATCH /v1/admin/buildings/:coreId` |
| **Add Device** | `buildings/[buildingId]/add-device-modal.tsx` | type (dynamic list), name, ip, status | `POST /v1/admin/buildings/:coreId/assets` |
| **Add Client** | `buildings/[buildingId]/add-client-modal.tsx` | firstName, lastName, idNumber, phone, buildingCoreIds | `POST /v1/admin/buildings/:coreId/clients` |
| **Report Incident** | `incidents/report-incident-modal.tsx` | Multi-step: building → client → type/priority → description/devices | `POST /v1/incidents` |
| **Create Work Order** | `work-orders/create-work-order-modal.tsx` | building, asset, type (dynamic list), title, notes, deadline | `POST /v1/work-orders` |
| **Edit Work Order** | `work-orders/[id]/edit-work-order-modal.tsx` | title, notes, contactNumber, deadline | `PATCH /v1/work-orders/:id` |
| **Add Employee** | `employees/add-employee-modal.tsx` | firstName, lastName, email, phone, department → position, createUser toggle, password | `POST /v1/employees` |
| **Edit Employee** | `employees/[employeeId]/edit-employee-modal.tsx` | All employee fields | `PATCH /v1/employees/:id` |
| **Dismiss Employee** | `employees/[employeeId]/dismiss-employee-modal.tsx` | Confirmation only | `POST /v1/employees/:id/dismiss` |
| **Delete Employee** | `employees/[employeeId]/delete-employee-dialog.tsx` | Delegation target (if active items exist) | `DELETE /v1/employees/:id/hard-delete` |
| **Create User Account** | `employees/[employeeId]/create-user-account-modal.tsx` | email, password, position | `POST /v1/employees/:id/create-user` |
| **Reset Password** | `employees/[employeeId]/reset-password-modal.tsx` | newPassword, confirmPassword | `POST /v1/employees/:id/reset-password` |
| **Add Product** | `inventory/add-product-modal.tsx` | sku, name, category (dynamic list), unit (dynamic list), threshold | `POST /v1/inventory/products` |
| **Create PO** | `inventory/create-purchase-order-modal.tsx` | supplierName, items (product, qty, prices) | `POST /v1/inventory/purchase-orders` |
| **Create Lead** | `sales/leads/create-lead-modal.tsx` | name, phone, city, address, building details, source, stage | `POST /v1/sales/leads` |
| **Change Stage** | `sales/leads/[id]/change-stage-modal.tsx` | targetStage, reason | `POST /v1/sales/leads/:id/change-stage` |
| **Add Position** | `admin/positions/add-position-modal.tsx` | name, description, roleGroup, department | `POST /v1/positions` |
| **Add Department** | `admin/departments/add-department-modal.tsx` | name, parentId, headId | `POST /v1/departments` |
| **Add Role Group** | `admin/role-groups/add-role-group-modal.tsx` | name, description | `POST /v1/role-groups` |
| **Assign Permissions** | `admin/role-groups/assign-permissions-modal.tsx` | Checkbox grid of permissions | `POST /v1/role-groups/:id/permissions` |
| **Create Group Chat** | `messenger/create-group-dialog.tsx` | name, participants (employee search) | `POST /v1/messenger/conversations` |

---

## 5. Auth Flow (User Perspective)

1. User navigates to any `/app/*` page
2. Frontend makes `GET /auth/me` to check session
3. If 401 → redirect to `/login?expired=1&next=<originalPath>`
4. Login page shows "session expired" message if `expired=1` param present
5. User enters email + password → `POST /auth/login`
6. Backend validates credentials, returns JWT in httpOnly cookie
7. Redirect to `next` param or `/app/dashboard`
8. Subsequent API calls include cookie automatically (same-origin via Next.js rewrites)
9. Dismissed users see "Your account has been dismissed" instead of "Invalid credentials"
10. Logout: `POST /auth/logout` clears cookie → redirect to `/login`

---

## 6. Third-Party UI Libraries

| Library | Version | Usage |
|---------|---------|-------|
| **Tailwind CSS** | 4.x | All styling (utility-first, no component library) |
| **Recharts** | 3.x | Charts in call center statistics, sales dashboard |
| **Socket.IO Client** | 4.x | Real-time messenger and telephony |
| **date-fns** | 4.x | Date formatting throughout the app |

No component library (shadcn, MUI, Ant Design, etc.) is used. All UI components are custom-built with Tailwind classes.
