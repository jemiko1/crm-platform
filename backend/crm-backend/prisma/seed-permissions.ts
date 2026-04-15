import "dotenv/config";
import { PrismaClient, PermissionCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const DEFAULT_PERMISSIONS = [
  // Buildings
  { resource: "buildings", action: "details_read", category: PermissionCategory.BUILDINGS, description: "View building detailed information" },
  { resource: "buildings", action: "create", category: PermissionCategory.BUILDINGS, description: "Create new buildings" },
  { resource: "buildings", action: "update", category: PermissionCategory.BUILDINGS, description: "Update building information" },
  { resource: "buildings", action: "delete", category: PermissionCategory.BUILDINGS, description: "Delete buildings" },

  // Clients
  { resource: "clients", action: "details_read", category: PermissionCategory.CLIENTS, description: "View client detailed information" },
  { resource: "clients", action: "create", category: PermissionCategory.CLIENTS, description: "Create new clients" },
  { resource: "clients", action: "update", category: PermissionCategory.CLIENTS, description: "Update client information" },
  { resource: "clients", action: "delete", category: PermissionCategory.CLIENTS, description: "Delete clients" },

  // Incidents
  { resource: "incidents", action: "details_read", category: PermissionCategory.INCIDENTS, description: "View incident detailed information" },
  { resource: "incidents", action: "create", category: PermissionCategory.INCIDENTS, description: "Create new incidents" },
  { resource: "incidents", action: "update", category: PermissionCategory.INCIDENTS, description: "Update incident information" },
  { resource: "incidents", action: "assign", category: PermissionCategory.INCIDENTS, description: "Assign incidents to employees" },
  { resource: "incidents", action: "delete", category: PermissionCategory.INCIDENTS, description: "Delete incidents" },

  // Work Orders - Basic CRUD
  { resource: "work_orders", action: "read", category: PermissionCategory.WORK_ORDERS, description: "View work orders list, details, and activity" },
  { resource: "work_orders", action: "create", category: PermissionCategory.WORK_ORDERS, description: "Create new work orders" },
  { resource: "work_orders", action: "update", category: PermissionCategory.WORK_ORDERS, description: "Update work order information and comments" },
  { resource: "work_orders", action: "delete", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders (inventory stays as-is)" },
  { resource: "work_orders", action: "delete_revert_inventory", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders and revert inventory to stock" },
  { resource: "work_orders", action: "export", category: PermissionCategory.WORK_ORDERS, description: "Export work orders data" },

  // Work Orders - Lifecycle
  { resource: "work_orders", action: "assign", category: PermissionCategory.WORK_ORDERS, description: "Assign and reassign employees to work orders" },
  { resource: "work_orders", action: "execute", category: PermissionCategory.WORK_ORDERS, description: "Start work, submit products, submit completion, request repair (technician actions)" },
  { resource: "work_orders", action: "approve", category: PermissionCategory.WORK_ORDERS, description: "Approve completed work orders" },
  { resource: "work_orders", action: "cancel", category: PermissionCategory.WORK_ORDERS, description: "Cancel work orders" },
  { resource: "work_orders", action: "manage_devices", category: PermissionCategory.WORK_ORDERS, description: "Add deactivated devices to work orders" },

  // Work Orders - Viewing
  { resource: "work_orders", action: "view_sensitive", category: PermissionCategory.WORK_ORDERS, description: "View sensitive data (costs, amounts)" },

  // Work Orders - Admin
  { resource: "work_orders", action: "manage", category: PermissionCategory.WORK_ORDERS, description: "Full work order management including workflow config (all permissions)" },

  // Assets
  { resource: "assets", action: "read", category: PermissionCategory.GENERAL, description: "View assets" },
  { resource: "assets", action: "create", category: PermissionCategory.GENERAL, description: "Create new assets" },
  { resource: "assets", action: "update", category: PermissionCategory.GENERAL, description: "Update asset information" },
  { resource: "assets", action: "delete", category: PermissionCategory.GENERAL, description: "Delete assets" },

  // Inventory
  { resource: "inventory", action: "read", category: PermissionCategory.INVENTORY, description: "View inventory" },
  { resource: "inventory", action: "create", category: PermissionCategory.INVENTORY, description: "Create inventory products" },
  { resource: "inventory", action: "update", category: PermissionCategory.INVENTORY, description: "Update inventory products" },
  { resource: "inventory", action: "delete", category: PermissionCategory.INVENTORY, description: "Delete inventory products" },
  { resource: "inventory", action: "purchase", category: PermissionCategory.INVENTORY, description: "Create purchase orders" },
  { resource: "inventory", action: "adjust", category: PermissionCategory.INVENTORY, description: "Adjust inventory stock" },

  // Employees
  { resource: "employees", action: "read", category: PermissionCategory.EMPLOYEES, description: "View employees" },
  { resource: "employees", action: "create", category: PermissionCategory.EMPLOYEES, description: "Create new employees" },
  { resource: "employees", action: "update", category: PermissionCategory.EMPLOYEES, description: "Update employee information" },
  { resource: "employees", action: "delete", category: PermissionCategory.EMPLOYEES, description: "Delete employees" },
  { resource: "employees", action: "assign", category: PermissionCategory.EMPLOYEES, description: "Assign employees to departments/roles" },
  { resource: "employee", action: "reset_password", category: PermissionCategory.EMPLOYEES, description: "Reset employee passwords" },
  { resource: "employee", action: "dismiss", category: PermissionCategory.EMPLOYEES, description: "Dismiss/terminate employees" },
  { resource: "employee", action: "activate", category: PermissionCategory.EMPLOYEES, description: "Reactivate dismissed employees" },
  { resource: "employee", action: "hard_delete", category: PermissionCategory.EMPLOYEES, description: "Permanently delete employees" },
  { resource: "employee", action: "create_account", category: PermissionCategory.EMPLOYEES, description: "Create user accounts for employees" },

  // Departments
  { resource: "departments", action: "read", category: PermissionCategory.EMPLOYEES, description: "View departments" },
  { resource: "departments", action: "create", category: PermissionCategory.EMPLOYEES, description: "Create new departments" },
  { resource: "departments", action: "update", category: PermissionCategory.EMPLOYEES, description: "Update department information" },
  { resource: "departments", action: "delete", category: PermissionCategory.EMPLOYEES, description: "Delete departments" },

  // Roles
  { resource: "roles", action: "read", category: PermissionCategory.EMPLOYEES, description: "View roles" },
  { resource: "roles", action: "create", category: PermissionCategory.EMPLOYEES, description: "Create new roles" },
  { resource: "roles", action: "update", category: PermissionCategory.EMPLOYEES, description: "Update role information" },
  { resource: "roles", action: "delete", category: PermissionCategory.EMPLOYEES, description: "Delete roles" },
  { resource: "roles", action: "assign_permissions", category: PermissionCategory.EMPLOYEES, description: "Assign permissions to roles" },

  // Permissions
  { resource: "permissions", action: "read", category: PermissionCategory.ADMIN, description: "View permissions" },
  { resource: "permissions", action: "manage", category: PermissionCategory.ADMIN, description: "Manage permissions" },

  // Reports
  { resource: "reports", action: "view", category: PermissionCategory.REPORTS, description: "View reports" },
  { resource: "reports", action: "export", category: PermissionCategory.REPORTS, description: "Export reports" },

  // Admin
  { resource: "admin", action: "access", category: PermissionCategory.ADMIN, description: "Access admin panel" },
  { resource: "admin", action: "manage_users", category: PermissionCategory.ADMIN, description: "Manage user accounts" },
  { resource: "admin", action: "manage_settings", category: PermissionCategory.ADMIN, description: "Manage system settings" },

  // Sales
  { resource: "sales", action: "read", category: PermissionCategory.SALES, description: "View sales dashboard and data" },
  { resource: "sales", action: "create", category: PermissionCategory.SALES, description: "Create sales records" },
  { resource: "sales", action: "update", category: PermissionCategory.SALES, description: "Update sales records" },
  { resource: "sales", action: "delete", category: PermissionCategory.SALES, description: "Delete sales records" },

  // Leads
  { resource: "leads", action: "read", category: PermissionCategory.SALES, description: "View leads" },
  { resource: "leads", action: "create", category: PermissionCategory.SALES, description: "Create new leads" },
  { resource: "leads", action: "update", category: PermissionCategory.SALES, description: "Update lead information" },
  { resource: "leads", action: "delete", category: PermissionCategory.SALES, description: "Delete leads" },
  { resource: "leads", action: "convert", category: PermissionCategory.SALES, description: "Convert leads to clients" },

  // Plans
  { resource: "plans", action: "read", category: PermissionCategory.SALES, description: "View sales plans" },
  { resource: "plans", action: "create", category: PermissionCategory.SALES, description: "Create sales plans" },
  { resource: "plans", action: "update", category: PermissionCategory.SALES, description: "Update sales plans" },
  { resource: "plans", action: "delete", category: PermissionCategory.SALES, description: "Delete sales plans" },

  // Tasks (employee workspace)
  { resource: "tasks", action: "read", category: PermissionCategory.GENERAL, description: "View tasks" },
  { resource: "tasks", action: "create", category: PermissionCategory.GENERAL, description: "Create tasks" },
  { resource: "tasks", action: "update", category: PermissionCategory.GENERAL, description: "Update tasks" },

  // Dashboard
  { resource: "dashboard", action: "read", category: PermissionCategory.GENERAL, description: "View dashboard" },

  // Settings
  { resource: "settings", action: "read", category: PermissionCategory.GENERAL, description: "View settings" },
  { resource: "settings", action: "update", category: PermissionCategory.GENERAL, description: "Update settings" },

  // Menu Visibility — controls sidebar visibility & list-page access
  { resource: "buildings", action: "menu", category: PermissionCategory.BUILDINGS, description: "Show Buildings in left menu" },
  { resource: "clients", action: "menu", category: PermissionCategory.CLIENTS, description: "Show Clients in left menu" },
  { resource: "incidents", action: "menu", category: PermissionCategory.INCIDENTS, description: "Show Incidents in left menu" },
  { resource: "assets", action: "menu", category: PermissionCategory.GENERAL, description: "Show Assets in left menu" },
  { resource: "work_orders", action: "menu", category: PermissionCategory.WORK_ORDERS, description: "Show Work Orders in left menu" },
  { resource: "sales", action: "menu", category: PermissionCategory.SALES, description: "Show Sales in left menu" },
  { resource: "inventory", action: "menu", category: PermissionCategory.INVENTORY, description: "Show Inventory in left menu" },
  { resource: "employees", action: "menu", category: PermissionCategory.EMPLOYEES, description: "Show Employees in left menu" },
  { resource: "admin", action: "menu", category: PermissionCategory.ADMIN, description: "Show Admin in left menu" },

  // Messenger
  { resource: "messenger", action: "create_group", category: PermissionCategory.MESSENGER, description: "Create group conversations in messenger" },
  { resource: "messenger", action: "manage_groups", category: PermissionCategory.MESSENGER, description: "Manage group settings and participants" },

  // Telephony
  { resource: "telephony", action: "call", category: PermissionCategory.TELEPHONY, description: "Originate, transfer, hangup calls and manage queue membership" },
  { resource: "telephony", action: "manage", category: PermissionCategory.TELEPHONY, description: "Manage telephony extensions and configuration" },
  { resource: "telephony", action: "menu", category: PermissionCategory.TELEPHONY, description: "Show Telephony in left menu" },

  // Missed Calls
  { resource: "missed_calls", action: "access", category: PermissionCategory.TELEPHONY, description: "View missed calls queue" },
  { resource: "missed_calls", action: "manage", category: PermissionCategory.TELEPHONY, description: "Claim, attempt, resolve, and ignore missed calls" },

  // SMS Configuration
  { resource: "sms_config", action: "access", category: PermissionCategory.ADMIN, description: "Access SMS configuration, logs, and spam protection settings" },

  // Bug Reports
  { resource: "bug_reports", action: "create", category: PermissionCategory.ADMIN, description: "Submit bug reports" },
  { resource: "bug_reports", action: "read", category: PermissionCategory.ADMIN, description: "View bug reports" },
  { resource: "bug_reports", action: "update", category: PermissionCategory.ADMIN, description: "Update bug report status" },
  { resource: "bug_reports", action: "delete", category: PermissionCategory.ADMIN, description: "Delete bug reports" },

  // Core Integration
  { resource: "core_integration", action: "view", category: PermissionCategory.ADMIN, description: "View core sync status, events, checkpoints and health" },

  // Client Chats (Unified Inbox)
  { resource: "client_chats", action: "menu", category: PermissionCategory.CLIENT_CHATS, description: "Show Client Chats in left menu and access inbox" },
  { resource: "client_chats", action: "reply", category: PermissionCategory.CLIENT_CHATS, description: "Send replies and messages to clients" },
  { resource: "client_chats", action: "assign", category: PermissionCategory.CLIENT_CHATS, description: "Assign/reassign conversations to agents" },
  { resource: "client_chats", action: "change_status", category: PermissionCategory.CLIENT_CHATS, description: "Change conversation status (open, close, spam)" },
  { resource: "client_chats", action: "link_client", category: PermissionCategory.CLIENT_CHATS, description: "Link/unlink clients to conversations" },
  { resource: "client_chats", action: "send_media", category: PermissionCategory.CLIENT_CHATS, description: "Send images and files to clients" },
  { resource: "client_chats", action: "send_template", category: PermissionCategory.CLIENT_CHATS, description: "Send WhatsApp template messages" },
  { resource: "client_chats", action: "use_canned", category: PermissionCategory.CLIENT_CHATS, description: "Use canned responses (quick replies)" },
  { resource: "client_chats", action: "manage_canned", category: PermissionCategory.CLIENT_CHATS, description: "Create and edit global canned responses" },
  { resource: "client_chats", action: "view_analytics", category: PermissionCategory.CLIENT_CHATS, description: "View chat analytics and reports" },
  { resource: "client_chats", action: "manage", category: PermissionCategory.CLIENT_CHATS, description: "Manager: view all chats, manage queues, escalations" },
  { resource: "client_chats", action: "delete", category: PermissionCategory.CLIENT_CHATS, description: "Permanently delete conversations with all messages and history" },
  { resource: "client_chats_config", action: "access", category: PermissionCategory.CLIENT_CHATS, description: "Configure Client Chats channels and assignment rules" },
];

async function main() {
  console.log("🌱 Seeding permissions...");

  let created = 0;
  let skipped = 0;

  for (const perm of DEFAULT_PERMISSIONS) {
    try {
      await prisma.permission.upsert({
        where: {
          resource_action: {
            resource: perm.resource,
            action: perm.action,
          },
        },
        update: {
          description: perm.description,
          category: perm.category,
        },
        create: {
          resource: perm.resource,
          action: perm.action,
          description: perm.description,
          category: perm.category,
        },
      });
      created++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        skipped++;
      } else {
        console.error(`Error creating permission ${perm.resource}.${perm.action}:`, error.message);
      }
    }
  }

  console.log(`✅ Permissions seeded: ${created} created, ${skipped} already existed`);
  console.log(`📊 Total permissions: ${DEFAULT_PERMISSIONS.length}`);

  // Clean up deprecated permissions that are no longer used
  const DEPRECATED_PERMISSIONS = [
    { resource: "buildings", action: "read" },
    { resource: "clients", action: "read" },
    { resource: "incidents", action: "read" },
    // Work order permissions consolidated in April 2026
    { resource: "work_orders", action: "delete_keep_inventory" },
    { resource: "work_orders", action: "reassign" },
    { resource: "work_orders", action: "start" },
    { resource: "work_orders", action: "complete" },
    { resource: "work_orders", action: "manage_products" },
    { resource: "work_orders", action: "request_repair" },
    { resource: "work_orders", action: "view_activity" },
    { resource: "work_orders", action: "view_workflow" },
    { resource: "work_orders", action: "add_comment" },
    { resource: "work_orders", action: "manage_workflow" },
    // Legacy hyphenated permissions from old seed-rbac.ts (replaced by underscore variants)
    { resource: "work-orders", action: "read" },
    { resource: "work-orders", action: "create" },
    { resource: "work-orders", action: "update" },
    { resource: "work-orders", action: "delete" },
    { resource: "work-orders", action: "assign" },
    { resource: "work-orders", action: "manage" },
    { resource: "role-groups", action: "read" },
    { resource: "role-groups", action: "manage" },
  ];

  let removed = 0;
  for (const dep of DEPRECATED_PERMISSIONS) {
    try {
      // First remove any role group references to this permission
      const perm = await prisma.permission.findUnique({
        where: { resource_action: { resource: dep.resource, action: dep.action } },
      });
      if (perm) {
        await prisma.roleGroupPermission.deleteMany({
          where: { permissionId: perm.id },
        });
        await prisma.permission.delete({
          where: { id: perm.id },
        });
        removed++;
        console.log(`🗑️  Removed deprecated permission: ${dep.resource}.${dep.action}`);
      }
    } catch {
      // Permission doesn't exist — skip silently
    }
  }
  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} deprecated permission(s)`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Error seeding permissions:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
