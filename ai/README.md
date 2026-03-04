# AI Knowledge Base

Structured project documentation for AI assistants (Claude Code, Cursor, Copilot).  
**Do not delete existing root-level docs.** This directory summarizes and references them.

---

## Directory Structure

```
ai/
├── README.md           (this file)
├── rules/
│   ├── engineering_rules.md
│   └── git_workflow.md
├── architecture/
│   ├── system_overview.md
│   ├── backend_architecture.md
│   ├── frontend_architecture.md
│   └── telephony_architecture.md
├── modules/
│   ├── backend_module.md
│   ├── frontend_module.md
│   ├── ami_bridge_module.md
│   └── crm_phone_module.md
└── devops/
    ├── deployment.md
    └── ci_pipeline.md
```

---

## Reading Order for AI

1. **Start**: `rules/git_workflow.md`, `rules/engineering_rules.md`
2. **Context**: `architecture/system_overview.md`
3. **Deep dive**: `architecture/backend_architecture.md`, `architecture/frontend_architecture.md`
4. **Telephony**: `architecture/telephony_architecture.md`
5. **Modules**: `modules/*.md` as needed
6. **DevOps**: `devops/deployment.md`, `devops/ci_pipeline.md`

---

## Source Documents (Not Deleted)

| ai/ file | References |
|----------|------------|
| engineering_rules | DEVELOPMENT_GUIDELINES.md, AI_WORKING_RULES.md, AI_DEVELOPMENT_CONTEXT.md |
| git_workflow | docs/DEVELOPMENT_WORKFLOW.md, docs/AI_WORKING_RULES.md |
| system_overview | PROJECT_SNAPSHOT.md, DOCUMENTATION_INDEX.md |
| backend_* | API_ROUTE_MAP.md, AUTH_CONFIG_SUMMARY.md |
| frontend_* | FRONTEND_ROUTE_MAP.md, MODAL_STACK_ARCHITECTURE.md |
| telephony_* | docs/TELEPHONY_INTEGRATION.md, docs/CALL_CENTER.md |
| ami_bridge | ami-bridge/README.md |
| crm_phone | docs/TELEPHONY_INTEGRATION.md |
| deployment | docs/RAILWAY_PRODUCTION_DEPLOY.md |
| ci_pipeline | docs/CI_CD.md, .github/workflows/ci.yml |

---

**Last updated**: 2026-03-04
