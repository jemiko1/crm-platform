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
  { resource: "work_orders", action: "read", category: PermissionCategory.WORK_ORDERS, description: "View work orders list and details" },
  { resource: "work_orders", action: "create", category: PermissionCategory.WORK_ORDERS, description: "Create new work orders" },
  { resource: "work_orders", action: "update", category: PermissionCategory.WORK_ORDERS, description: "Update work order information" },
  { resource: "work_orders", action: "delete", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders (basic - no inventory impact)" },
  { resource: "work_orders", action: "export", category: PermissionCategory.WORK_ORDERS, description: "Export work orders data" },

  // Work Orders - Deletion with Inventory Control
  { resource: "work_orders", action: "delete_keep_inventory", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders and keep inventory changes" },
  { resource: "work_orders", action: "delete_revert_inventory", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders and revert inventory to stock" },

  // Work Orders - Assignment & Workflow
  { resource: "work_orders", action: "assign", category: PermissionCategory.WORK_ORDERS, description: "Assign employees to work orders" },
  { resource: "work_orders", action: "reassign", category: PermissionCategory.WORK_ORDERS, description: "Reassign work orders to different employees" },
  { resource: "work_orders", action: "start", category: PermissionCategory.WORK_ORDERS, description: "Start work on assigned orders" },
  { resource: "work_orders", action: "complete", category: PermissionCategory.WORK_ORDERS, description: "Submit work for review/approval" },
  { resource: "work_orders", action: "approve", category: PermissionCategory.WORK_ORDERS, description: "Approve or reject completed work orders" },
  { resource: "work_orders", action: "cancel", category: PermissionCategory.WORK_ORDERS, description: "Cancel work orders" },

  // Work Orders - Products & Inventory
  { resource: "work_orders", action: "manage_products", category: PermissionCategory.WORK_ORDERS, description: "Add/modify product usage in work orders" },
  { resource: "work_orders", action: "manage_devices", category: PermissionCategory.WORK_ORDERS, description: "Add deactivated devices to work orders" },
  { resource: "work_orders", action: "request_repair", category: PermissionCategory.WORK_ORDERS, description: "Convert diagnostic to repair work order" },

  // Work Orders - Viewing & Comments
  { resource: "work_orders", action: "view_activity", category: PermissionCategory.WORK_ORDERS, description: "View work order activity timeline" },
  { resource: "work_orders", action: "view_workflow", category: PermissionCategory.WORK_ORDERS, description: "View workflow debug info (admin only)" },
  { resource: "work_orders", action: "view_sensitive", category: PermissionCategory.WORK_ORDERS, description: "View sensitive data (costs, amounts)" },
  { resource: "work_orders", action: "add_comment", category: PermissionCategory.WORK_ORDERS, description: "Add comments to work orders" },

  // Work Orders - Admin
  { resource: "work_orders", action: "manage_workflow", category: PermissionCategory.WORK_ORDERS, description: "Configure workflow settings in admin panel" },
  { resource: "work_orders", action: "manage", category: PermissionCategory.WORK_ORDERS, description: "Full work order management (all permissions)" },

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
  ];

  let removed = 0;
  for (const dep of DEPRECATED_PERMISSIONS) {
    try {
      await prisma.permission.delete({
        where: { resource_action: { resource: dep.resource, action: dep.action } },
      });
      removed++;
      console.log(`🗑️  Removed deprecated permission: ${dep.resource}.${dep.action}`);
    } catch {
      // Permission doesn't exist or is still referenced — skip silently
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
