# CRM Platform - Documentation Index

**Purpose**: Guide for new conversations to quickly understand the project structure and find relevant documentation.

---

## 📚 ESSENTIAL DOCUMENTATION FILES

### 1. **SESSION_SUMMARY.md** ⭐ START HERE
**Purpose**: Complete compressed summary of all work done, patterns, issues, and current state  
**Use When**: Starting a new conversation, need context on what's been implemented  
**Contains**: Architecture, features, patterns, known issues, file structure, migrations, git history

### 2. **DEVELOPMENT_GUIDELINES.md** ⭐
**Purpose**: Development patterns and best practices  
**Use When**: Implementing new features, fixing bugs, following established patterns  
**Contains**: 
- Modal/popup implementation patterns
- Known issues & TODO list
- Future guidelines (API patterns, validation, error handling)

### 3. **PROJECT_SNAPSHOT.md**
**Purpose**: High-level project overview and structure  
**Use When**: Understanding project architecture, tech stack, module organization  
**Contains**: 
- Repository structure (backend/frontend trees)
- Tech stack details
- Key files and their purposes
- Module organization

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
- `API_ROUTE_MAP.md` - All endpoints (including Messenger REST + WebSocket)
- `AUTH_CONFIG_SUMMARY.md` - Auth & permissions
- `SESSION_SUMMARY.md` - Backend patterns section
- `backend/crm-backend/README.md` - Backend-specific docs

### **Frontend Development**
- `FRONTEND_ROUTE_MAP.md` - All routes + global components (Messenger, Header)
- `DEVELOPMENT_GUIDELINES.md` - Modal patterns
- `SESSION_SUMMARY.md` - Frontend patterns section
- `frontend/crm-frontend/README.md` - Frontend-specific docs

### **Messenger / Real-time**
- `API_ROUTE_MAP.md` - Messenger REST endpoints + WebSocket gateway events
- `FRONTEND_ROUTE_MAP.md` - Messenger component files and architecture
- `PROJECT_SNAPSHOT.md` - Messenger feature overview (Section 5: Core Modules)

### **Database & Migrations**
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

### **Get Full Context**
→ `SESSION_SUMMARY.md`

### **Understand Project Structure**
→ `PROJECT_SNAPSHOT.md`

---

## Process & Workflow Documentation (`docs/`)

> These are the **canonical, single-source-of-truth** documents for development process, testing, CI/CD, and release management. They supersede any conflicting instructions found in the root-level .md files.

| Document | Purpose |
|----------|---------|
| [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) | Branch strategy (master/staging/dev/feature), commit conventions, PR process |
| [`docs/TESTING.md`](docs/TESTING.md) | Test setup, running tests locally, writing new tests |
| [`docs/CI_CD.md`](docs/CI_CD.md) | CI pipeline explanation, GitHub branch protection setup guide |
| [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) | Release flow (dev -> staging -> master), rollback procedures, migration safety |
| [`docs/AI_WORKING_RULES.md`](docs/AI_WORKING_RULES.md) | Rules for AI assistants: branch restrictions, commit style, code standards |

---

## DOCUMENTATION MAINTENANCE

**When to Update**:
- `SESSION_SUMMARY.md` - After major features or significant changes
- `DEVELOPMENT_GUIDELINES.md` - When adding new patterns or fixing issues
- `API_ROUTE_MAP.md` - When adding/modifying API endpoints
- `FRONTEND_ROUTE_MAP.md` - When adding/modifying frontend routes
- `PROJECT_SNAPSHOT.md` - When project structure changes significantly
- `docs/*` - When process, CI, testing, or release procedures change

**Last Updated**: 2026-02-20

---

## FOR NEW CONVERSATIONS

**Recommended Reading Order**:
1. `SESSION_SUMMARY.md` (complete context)
2. `docs/DEVELOPMENT_WORKFLOW.md` (branch strategy & workflow)
3. `docs/AI_WORKING_RULES.md` (AI assistant rules)
4. `DEVELOPMENT_GUIDELINES.md` (code patterns & issues)
5. `PROJECT_SNAPSHOT.md` (architecture)
6. Topic-specific docs as needed

**Quick Start**: Read `SESSION_SUMMARY.md` first - it contains compressed but complete information about everything implemented. Then read `docs/DEVELOPMENT_WORKFLOW.md` for the branching and release process.

---

**END OF DOCUMENTATION INDEX**
