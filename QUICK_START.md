# CRM Platform - Quick Start Guide for New Sessions

**Last Updated**: 2026-01-15  
**Version**: v1.0.0

---

## 🚀 Getting Started

### Current Project State
- ✅ Buildings, Clients, Incidents modules complete
- ✅ Admin panel with RBAC (Positions, Role Groups, Departments)
- ✅ List Items Management for dynamic dropdowns
- ✅ Permissions system restored (49 permissions)
- ✅ Performance optimizations complete (4-10x faster)

### Key Terminology
- **Devices** = Building assets (elevators, doors, intercoms, etc.)
- **Products** = Inventory items (routers, sensors, etc.)
- **System Lists** = Dynamic dropdown values managed by admins

---

## 📋 Critical Development Rules

### 1. Dynamic Lists (MANDATORY)
```tsx
// ❌ NEVER DO THIS
const TYPES = ["TYPE1", "TYPE2"];

// ✅ ALWAYS DO THIS
const { items: types } = useListItems("ASSET_TYPE");
```

**Why**: Admins need to manage dropdown values without code deployments.

### 2. Modal Implementation (MANDATORY)
```tsx
// ✅ REQUIRED PATTERN
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!open || !mounted) return null;
return createPortal(modalContent, document.body);
```

**Why**: Ensures proper centering and avoids parent container issues.

### 3. API Client (MANDATORY)
```tsx
// ❌ NEVER DO THIS
fetch("http://localhost:3000/v1/...")

// ✅ ALWAYS DO THIS
import { apiGet, apiPost } from "@/lib/api";
const data = await apiGet("/v1/...");
```

**Why**: Centralized error handling, cookie management, type safety.

---

## 🗂️ Key Files Reference

### Backend
- `backend/crm-backend/src/main.ts` - App entry point
- `backend/crm-backend/src/app.module.ts` - Root module
- `backend/crm-backend/prisma/schema.prisma` - Database schema
- `backend/crm-backend/prisma/seed-permissions.ts` - Permissions seed

### Frontend
- `frontend/crm-frontend/src/lib/api.ts` - API client
- `frontend/crm-frontend/src/hooks/useListItems.ts` - Dynamic lists hook
- `frontend/crm-frontend/src/app/modal-dialog.tsx` - Modal reference
- `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx` - Devices tab example

---

## 🔧 Common Tasks

### Restore Permissions
```bash
cd backend/crm-backend
npx tsx prisma/seed-permissions.ts
```

### Start Development Servers
```bash
# Backend (Terminal 1)
cd backend/crm-backend
npm run start:dev

# Frontend (Terminal 2)
cd frontend/crm-frontend
npm run dev
```

### Run Migrations
```bash
cd backend/crm-backend
npx prisma migrate dev
npx prisma generate
```

---

## 📚 Documentation Files

1. **PROJECT_SNAPSHOT.md** - Current project state, architecture, file structure
2. **SESSION_SUMMARY.md** - Complete feature list, patterns, migrations
3. **DEVELOPMENT_GUIDELINES.md** - Detailed patterns, examples, best practices
4. **QUICK_START.md** - This file (quick reference)

---

## 🎯 Current Features

### Completed
- ✅ Buildings management with Devices tab
- ✅ Clients management
- ✅ Incidents with device selection
- ✅ Employee management
- ✅ RBAC (Positions, Role Groups, Departments)
- ✅ List Items Management (Admin panel)
- ✅ Permissions system
- ✅ Performance optimizations

### Architecture
- **Backend**: NestJS + Prisma + PostgreSQL
- **Frontend**: Next.js 15 App Router + Tailwind CSS
- **Auth**: JWT cookies (httpOnly)
- **RBAC**: Position-based permissions

---

## ⚠️ Important Notes

1. **Never hardcode dropdowns** - Always use `useListItems(categoryCode)`
2. **Always use `createPortal`** for modals
3. **Use centralized API client** - Never raw `fetch`
4. **Terminology matters** - Devices vs Products
5. **Auto-generate codes** - Departments, Positions, Role Groups

---

## 🔍 Quick Search

### Find Modal Examples
```bash
grep -r "createPortal" frontend/crm-frontend/src/app
```

### Find API Calls
```bash
grep -r "apiGet\|apiPost" frontend/crm-frontend/src/app
```

### Find List Items Usage
```bash
grep -r "useListItems" frontend/crm-frontend/src/app
```

---

**For detailed information, see PROJECT_SNAPSHOT.md and DEVELOPMENT_GUIDELINES.md**
