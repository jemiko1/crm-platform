# CRM Platform - Documentation Index

**Purpose**: Guide for new conversations to quickly understand the project structure and find relevant documentation.

---

## 📚 PRIMARY REFERENCE

### **PROJECT_SNAPSHOT.md** ⭐ START HERE — SINGLE SOURCE OF TRUTH
**Purpose**: One file with all core information for AI tools and developers  
**Use When**: Starting any work, onboarding, or needing quick reference  
**Contains**: 
- Ports & URLs (production 3000/3002, dev 4000/4002)
- Database (Docker PostgreSQL, localhost:5433, DATABASE_URL)
- Git workflow (dev branch, commit format, releases)
- Authentication (JWT 30min, 401 handling)
- Modal system (detail vs action modals, z-index, history-based)
- UI rules (dynamic lists, API client, terminology)
- Key files, quick start, routes summary, API summary
- Critical rules checklist

**Read this file first.** Use other docs only when you need deeper detail.

---

## 📚 SUPPLEMENTARY DOCUMENTATION

### 1. **SESSION_SUMMARY.md**
**Purpose**: Feature history, migrations, patterns over time  
**Use When**: Understanding what's been implemented, migration history  
**Contains**: Architecture, features, patterns, known issues, file structure, git history

### 2. **DEVELOPMENT_GUIDELINES.md**
**Purpose**: Detailed development patterns and examples  
**Use When**: Implementing modals, dynamic lists, performance optimizations  
**Contains**: 
- Dynamic list usage (useListItems, categories)
- Modal/popup implementation patterns (createPortal, z-index)
- Performance guidelines (N+1, parallel queries, caching)
- Known issues & TODO list

### 4. **API_ROUTE_MAP.md**
**Purpose**: Complete API endpoint documentation  
**Use When**: Understanding backend API structure, finding endpoints, checking guards/permissions  
**Contains**: 
- All controller files and base routes
- HTTP methods and full paths
- Guards and permission requirements
- Module-by-module breakdown

### 5. **FRONTEND_ROUTE_MAP.md**
**Purpose**: Complete frontend route documentation  
**Use When**: Understanding frontend structure, finding pages, checking API integrations  
**Contains**: 
- All route paths and their purposes
- Key files per route
- API endpoints called
- Status (working/partial/placeholder)

### 6. **AUTH_CONFIG_SUMMARY.md**
**Purpose**: Authentication and authorization configuration  
**Use When**: Understanding auth flow, RBAC system, permission checks  
**Contains**: 
- JWT configuration
- Role-based access control
- Permission system
- Guard implementations

---

## 🗂️ DOCUMENTATION BY TOPIC

### **Getting Started**
1. Read `SESSION_SUMMARY.md` for complete context
2. Read `PROJECT_SNAPSHOT.md` for architecture overview
3. Read `DEVELOPMENT_GUIDELINES.md` for patterns

### **Backend Development**
- `API_ROUTE_MAP.md` - All endpoints
- `AUTH_CONFIG_SUMMARY.md` - Auth & permissions
- `SESSION_SUMMARY.md` - Backend patterns section
- `backend/crm-backend/README.md` - Backend-specific docs

### **Frontend Development**
- `FRONTEND_ROUTE_MAP.md` - All routes
- `DEVELOPMENT_GUIDELINES.md` - Modal patterns
- `SESSION_SUMMARY.md` - Frontend patterns section
- `frontend/crm-frontend/README.md` - Frontend-specific docs

### **Database & Migrations**
- `PROJECT_SNAPSHOT.md` - **Database Setup** (Docker PostgreSQL, localhost:5433, DATABASE_URL)
- `SESSION_SUMMARY.md` - Migrations list, schema key points
- `backend/crm-backend/prisma/schema.prisma` - Full schema
- `backend/crm-backend/prisma/migrations/*` - Migration history

### **Known Issues**
- `DEVELOPMENT_GUIDELINES.md` - Known Issues & TODO section
- `SESSION_SUMMARY.md` - Known Issues section

### **Code Patterns**
- `DEVELOPMENT_GUIDELINES.md` - Modal implementation
- `SESSION_SUMMARY.md` - Backend/Frontend patterns sections

---

## 🔍 QUICK REFERENCE

### **Find API Endpoints**
→ `API_ROUTE_MAP.md`

### **Find Frontend Routes**
→ `FRONTEND_ROUTE_MAP.md`

### **Understand Auth System**
→ `AUTH_CONFIG_SUMMARY.md`

### **Follow Development Patterns**
→ `DEVELOPMENT_GUIDELINES.md`

### **Get Full Context (Single File)**
→ `PROJECT_SNAPSHOT.md` — ports, DB, auth, modals, UI rules, key files

### **Get Feature History**
→ `SESSION_SUMMARY.md`

### **Understand Project Structure**
→ `PROJECT_SNAPSHOT.md`

---

## 📝 DOCUMENTATION MAINTENANCE

**When to Update**:
- `SESSION_SUMMARY.md` - After major features or significant changes
- `DEVELOPMENT_GUIDELINES.md` - When adding new patterns or fixing issues
- `API_ROUTE_MAP.md` - When adding/modifying API endpoints
- `FRONTEND_ROUTE_MAP.md` - When adding/modifying frontend routes
- `PROJECT_SNAPSHOT.md` - When project structure changes significantly

**Last Updated**: 2025-01-15

---

## 🚀 FOR NEW CONVERSATIONS

**Recommended Reading Order**:
1. `PROJECT_SNAPSHOT.md` (single source of truth — ports, DB, auth, modals, UI rules)
2. `DEVELOPMENT_GUIDELINES.md` (detailed patterns)
3. Topic-specific docs as needed

**Quick Start**: Read `PROJECT_SNAPSHOT.md` first — it contains all core information for AI tools and developers.

---

**END OF DOCUMENTATION INDEX**
