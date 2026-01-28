/**
 * RBAC Seed Script
 * 
 * Seeds the database with:
 * 1. Default Permissions (all module.action combinations)
 * 2. Default Role Groups (bundles of permissions)
 * 3. Default Positions (mapped to existing UserRole enum)
 * 
 * Run with: npx tsx prisma/seed-rbac.ts
 */

import 'dotenv/config';
import { PrismaClient, PermissionCategory, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

// ============================================================================
// PERMISSIONS DEFINITION
// ============================================================================

interface PermissionDef {
  resource: string;
  action: string;
  description: string;
  category: PermissionCategory;
}

const PERMISSIONS: PermissionDef[] = [
  // Buildings
  { resource: 'buildings', action: 'read', description: 'View buildings', category: 'BUILDINGS' },
  { resource: 'buildings', action: 'create', description: 'Create buildings', category: 'BUILDINGS' },
  { resource: 'buildings', action: 'update', description: 'Update buildings', category: 'BUILDINGS' },
  { resource: 'buildings', action: 'delete', description: 'Delete buildings', category: 'BUILDINGS' },
  { resource: 'buildings', action: 'manage', description: 'Full building management', category: 'BUILDINGS' },

  // Clients
  { resource: 'clients', action: 'read', description: 'View clients', category: 'CLIENTS' },
  { resource: 'clients', action: 'create', description: 'Create clients', category: 'CLIENTS' },
  { resource: 'clients', action: 'update', description: 'Update clients', category: 'CLIENTS' },
  { resource: 'clients', action: 'delete', description: 'Delete clients', category: 'CLIENTS' },
  { resource: 'clients', action: 'manage', description: 'Full client management', category: 'CLIENTS' },

  // Incidents
  { resource: 'incidents', action: 'read', description: 'View incidents', category: 'INCIDENTS' },
  { resource: 'incidents', action: 'create', description: 'Create incidents', category: 'INCIDENTS' },
  { resource: 'incidents', action: 'update', description: 'Update incidents', category: 'INCIDENTS' },
  { resource: 'incidents', action: 'delete', description: 'Delete incidents', category: 'INCIDENTS' },
  { resource: 'incidents', action: 'assign', description: 'Assign incidents', category: 'INCIDENTS' },
  { resource: 'incidents', action: 'manage', description: 'Full incident management', category: 'INCIDENTS' },

  // Work Orders
  { resource: 'work-orders', action: 'read', description: 'View work orders', category: 'WORK_ORDERS' },
  { resource: 'work-orders', action: 'create', description: 'Create work orders', category: 'WORK_ORDERS' },
  { resource: 'work-orders', action: 'update', description: 'Update work orders', category: 'WORK_ORDERS' },
  { resource: 'work-orders', action: 'delete', description: 'Delete work orders', category: 'WORK_ORDERS' },
  { resource: 'work-orders', action: 'assign', description: 'Assign work orders', category: 'WORK_ORDERS' },
  { resource: 'work-orders', action: 'manage', description: 'Full work order management', category: 'WORK_ORDERS' },

  // Inventory
  { resource: 'inventory', action: 'read', description: 'View inventory', category: 'INVENTORY' },
  { resource: 'inventory', action: 'create', description: 'Add inventory items', category: 'INVENTORY' },
  { resource: 'inventory', action: 'update', description: 'Update inventory', category: 'INVENTORY' },
  { resource: 'inventory', action: 'delete', description: 'Remove inventory items', category: 'INVENTORY' },
  { resource: 'inventory', action: 'manage', description: 'Full inventory management', category: 'INVENTORY' },

  // Employees
  { resource: 'employees', action: 'read', description: 'View employees', category: 'EMPLOYEES' },
  { resource: 'employees', action: 'create', description: 'Create employees', category: 'EMPLOYEES' },
  { resource: 'employees', action: 'update', description: 'Update employees', category: 'EMPLOYEES' },
  { resource: 'employees', action: 'delete', description: 'Delete employees', category: 'EMPLOYEES' },
  { resource: 'employees', action: 'manage', description: 'Full employee management', category: 'EMPLOYEES' },

  // Reports
  { resource: 'reports', action: 'read', description: 'View reports', category: 'REPORTS' },
  { resource: 'reports', action: 'export', description: 'Export reports', category: 'REPORTS' },
  { resource: 'reports', action: 'manage', description: 'Full report management', category: 'REPORTS' },

  // Admin
  { resource: 'admin', action: 'access', description: 'Access admin panel', category: 'ADMIN' },
  { resource: 'positions', action: 'read', description: 'View positions', category: 'ADMIN' },
  { resource: 'positions', action: 'manage', description: 'Manage positions', category: 'ADMIN' },
  { resource: 'role-groups', action: 'read', description: 'View role groups', category: 'ADMIN' },
  { resource: 'role-groups', action: 'manage', description: 'Manage role groups', category: 'ADMIN' },
  { resource: 'departments', action: 'read', description: 'View departments', category: 'ADMIN' },
  { resource: 'departments', action: 'manage', description: 'Manage departments', category: 'ADMIN' },
  { resource: 'users', action: 'read', description: 'View users', category: 'ADMIN' },
  { resource: 'users', action: 'manage', description: 'Manage users', category: 'ADMIN' },
];

// ============================================================================
// ROLE GROUPS DEFINITION
// ============================================================================

interface RoleGroupDef {
  name: string;
  code: string;
  description: string;
  permissions: string[]; // Array of "resource.action" strings
}

const ROLE_GROUPS: RoleGroupDef[] = [
  {
    name: 'Full Access',
    code: 'FULL_ACCESS',
    description: 'Complete access to all system features',
    permissions: PERMISSIONS.map(p => `${p.resource}.${p.action}`), // All permissions
  },
  {
    name: 'Management',
    code: 'MANAGEMENT',
    description: 'Management-level access with oversight capabilities',
    permissions: [
      'buildings.read', 'buildings.update',
      'clients.read', 'clients.update',
      'incidents.read', 'incidents.update', 'incidents.assign',
      'work-orders.read', 'work-orders.update', 'work-orders.assign',
      'inventory.read',
      'employees.read',
      'reports.read', 'reports.export',
      'admin.access',
      'departments.read',
    ],
  },
  {
    name: 'Call Center',
    code: 'CALL_CENTER',
    description: 'Call center staff - incident creation and client lookup',
    permissions: [
      'buildings.read',
      'clients.read',
      'incidents.read', 'incidents.create', 'incidents.update',
      'work-orders.read',
    ],
  },
  {
    name: 'Field Technician',
    code: 'TECHNICIAN',
    description: 'Field technicians - work order execution',
    permissions: [
      'buildings.read',
      'clients.read',
      'incidents.read',
      'work-orders.read', 'work-orders.update',
      'inventory.read',
    ],
  },
  {
    name: 'Warehouse Staff',
    code: 'WAREHOUSE',
    description: 'Warehouse personnel - inventory management',
    permissions: [
      'inventory.read', 'inventory.create', 'inventory.update',
      'work-orders.read',
    ],
  },
];

// ============================================================================
// POSITIONS DEFINITION (Mapped to existing UserRole enum)
// ============================================================================

interface PositionDef {
  name: string;
  code: string;
  description: string;
  level: number;
  roleGroupCode: string;
  legacyRole: UserRole; // Maps to existing User.role enum
}

const POSITIONS: PositionDef[] = [
  {
    name: 'System Administrator',
    code: 'ADMIN',
    description: 'Full system administrator with complete access',
    level: 100,
    roleGroupCode: 'FULL_ACCESS',
    legacyRole: 'ADMIN',
  },
  {
    name: 'Manager',
    code: 'MANAGER',
    description: 'Department or team manager with oversight capabilities',
    level: 80,
    roleGroupCode: 'MANAGEMENT',
    legacyRole: 'MANAGER',
  },
  {
    name: 'Call Center Operator',
    code: 'CALL_CENTER',
    description: 'Call center staff handling customer inquiries and incidents',
    level: 40,
    roleGroupCode: 'CALL_CENTER',
    legacyRole: 'CALL_CENTER',
  },
  {
    name: 'Field Technician',
    code: 'TECHNICIAN',
    description: 'Field technician executing work orders',
    level: 50,
    roleGroupCode: 'TECHNICIAN',
    legacyRole: 'TECHNICIAN',
  },
  {
    name: 'Warehouse Staff',
    code: 'WAREHOUSE',
    description: 'Warehouse personnel managing inventory',
    level: 30,
    roleGroupCode: 'WAREHOUSE',
    legacyRole: 'WAREHOUSE',
  },
];

// ============================================================================
// SEED FUNCTION
// ============================================================================

async function seedRBAC() {
  console.log('🔐 Starting RBAC seed...\n');

  // 1. Seed Permissions
  console.log('📋 Seeding permissions...');
  const permissionMap = new Map<string, string>();

  for (const perm of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
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
    permissionMap.set(`${perm.resource}.${perm.action}`, permission.id);
    console.log(`  ✓ ${perm.resource}.${perm.action}`);
  }
  console.log(`  Total: ${PERMISSIONS.length} permissions\n`);

  // 2. Seed Role Groups
  console.log('👥 Seeding role groups...');
  const roleGroupMap = new Map<string, string>();

  for (const rg of ROLE_GROUPS) {
    // Create or update role group
    const roleGroup = await prisma.roleGroup.upsert({
      where: { code: rg.code },
      update: {
        name: rg.name,
        description: rg.description,
      },
      create: {
        name: rg.name,
        code: rg.code,
        description: rg.description,
      },
    });
    roleGroupMap.set(rg.code, roleGroup.id);

    // Clear existing permissions
    await prisma.roleGroupPermission.deleteMany({
      where: { roleGroupId: roleGroup.id },
    });

    // Assign permissions
    const permissionIds = rg.permissions
      .map(p => permissionMap.get(p))
      .filter((id): id is string => id !== undefined);

    if (permissionIds.length > 0) {
      await prisma.roleGroupPermission.createMany({
        data: permissionIds.map(permissionId => ({
          roleGroupId: roleGroup.id,
          permissionId,
        })),
      });
    }

    console.log(`  ✓ ${rg.name} (${rg.code}) - ${permissionIds.length} permissions`);
  }
  console.log(`  Total: ${ROLE_GROUPS.length} role groups\n`);

  // 3. Seed Positions
  console.log('🎯 Seeding positions...');
  const positionMap = new Map<string, string>();

  for (const pos of POSITIONS) {
    const roleGroupId = roleGroupMap.get(pos.roleGroupCode);
    if (!roleGroupId) {
      console.error(`  ✗ Role group ${pos.roleGroupCode} not found for position ${pos.code}`);
      continue;
    }

    const position = await prisma.position.upsert({
      where: { code: pos.code },
      update: {
        name: pos.name,
        description: pos.description,
        level: pos.level,
        roleGroupId,
      },
      create: {
        name: pos.name,
        code: pos.code,
        description: pos.description,
        level: pos.level,
        roleGroupId,
      },
    });
    positionMap.set(pos.code, position.id);
    console.log(`  ✓ ${pos.name} (${pos.code}) → ${pos.roleGroupCode}`);
  }
  console.log(`  Total: ${POSITIONS.length} positions\n`);

  // 4. Backfill: Link existing employees to positions based on User.role
  console.log('🔄 Backfilling employee positions...');
  
  const employees = await prisma.employee.findMany({
    where: { positionId: null },
    include: { user: true },
  });

  let backfilledCount = 0;
  for (const emp of employees) {
    if (!emp.user) continue;

    // Find position that matches the user's legacy role
    const matchingPosition = POSITIONS.find(p => p.legacyRole === emp.user!.role);
    if (!matchingPosition) continue;

    const positionId = positionMap.get(matchingPosition.code);
    if (!positionId) continue;

    await prisma.employee.update({
      where: { id: emp.id },
      data: { positionId },
    });
    backfilledCount++;
    console.log(`  ✓ ${emp.firstName} ${emp.lastName} → ${matchingPosition.name}`);
  }
  console.log(`  Backfilled: ${backfilledCount} employees\n`);

  // 5. Set SuperAdmin flag for existing ADMIN users
  console.log('👑 Setting SuperAdmin flags...');
  const adminResult = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { isSuperAdmin: true },
  });
  console.log(`  Set isSuperAdmin=true for ${adminResult.count} admin users\n`);

  console.log('✅ RBAC seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`  • Permissions: ${PERMISSIONS.length}`);
  console.log(`  • Role Groups: ${ROLE_GROUPS.length}`);
  console.log(`  • Positions: ${POSITIONS.length}`);
  console.log(`  • Employees Backfilled: ${backfilledCount}`);
  console.log(`  • SuperAdmins: ${adminResult.count}`);
}

// Run
seedRBAC()
  .catch((e) => {
    console.error('❌ RBAC seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
