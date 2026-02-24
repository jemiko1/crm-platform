import 'dotenv/config';
import { PrismaClient, PermissionCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('🌱 Seeding Sales CRM data...');

  // ==================== LEAD STAGES ====================
  console.log('Creating lead stages...');

  const stages = [
    {
      code: 'POTENTIAL',
      name: 'Potential Building',
      nameKa: 'პოტენციური კორპუსი',
      sortOrder: 1,
      color: '#6366f1', // Indigo
      isTerminal: false,
    },
    {
      code: 'OFFERING',
      name: 'Offering Stage',
      nameKa: 'შეთავაზების ეტაპი',
      sortOrder: 2,
      color: '#8b5cf6', // Purple
      isTerminal: false,
    },
    {
      code: 'NEGOTIATION',
      name: 'Negotiation Stage',
      nameKa: 'მოლაპარაკების ეტაპი',
      sortOrder: 3,
      color: '#f59e0b', // Amber
      isTerminal: false,
    },
    {
      code: 'APPROVAL',
      name: 'Approval Stage',
      nameKa: 'დადასტურების ეტაპი',
      sortOrder: 4,
      color: '#3b82f6', // Blue
      isTerminal: false,
      autoSkipConditions: { positionKey: 'HEAD_OF_SALES_POSITION' },
    },
    {
      code: 'WON',
      name: 'Lead Won',
      nameKa: 'წარმატებული გარიგება',
      sortOrder: 5,
      color: '#10b981', // Emerald
      isTerminal: true,
    },
    {
      code: 'LOST',
      name: 'Lead Lost',
      nameKa: 'წაგებული გარიგება',
      sortOrder: 6,
      color: '#ef4444', // Red
      isTerminal: true,
    },
  ];

  for (const stage of stages) {
    await prisma.leadStage.upsert({
      where: { code: stage.code },
      update: {
        name: stage.name,
        nameKa: stage.nameKa,
        sortOrder: stage.sortOrder,
        color: stage.color,
        isTerminal: stage.isTerminal,
        autoSkipConditions: stage.autoSkipConditions,
      },
      create: stage,
    });
  }
  console.log(`  ✅ Created ${stages.length} lead stages`);

  // ==================== LEAD SOURCES ====================
  console.log('Creating lead sources...');

  const sources = [
    { code: 'CALL_CENTER', name: 'Call Center', nameKa: 'ქოლ ცენტრი', sortOrder: 1 },
    { code: 'REFERRAL', name: 'Referral', nameKa: 'რეფერალი', sortOrder: 2 },
    { code: 'WEBSITE', name: 'Website', nameKa: 'ვებსაიტი', sortOrder: 3 },
    { code: 'SOCIAL_MEDIA', name: 'Social Media', nameKa: 'სოციალური მედია', sortOrder: 4 },
    { code: 'COLD_CALL', name: 'Cold Call', nameKa: 'ცივი დარეკვა', sortOrder: 5 },
    { code: 'PARTNER', name: 'Partner', nameKa: 'პარტნიორი', sortOrder: 6 },
    { code: 'EVENT', name: 'Event', nameKa: 'ღონისძიება', sortOrder: 7 },
    { code: 'OTHER', name: 'Other', nameKa: 'სხვა', sortOrder: 99 },
  ];

  for (const source of sources) {
    await prisma.leadSource.upsert({
      where: { code: source.code },
      update: {
        name: source.name,
        nameKa: source.nameKa,
        sortOrder: source.sortOrder,
      },
      create: source,
    });
  }
  console.log(`  ✅ Created ${sources.length} lead sources`);

  // ==================== SALES SERVICES ====================
  console.log('Creating sales services...');

  const services = [
    {
      code: 'CARD_MONTHLY',
      name: 'ASG Card Monthly Fee',
      nameKa: 'ASG- ბარათის ყოველთვიური გადასახადი',
      monthlyPrice: 5,
      sortOrder: 1,
    },
    {
      code: 'CARD_ONETIME',
      name: 'ASG Card One-time Cost',
      nameKa: 'ASG-ბარათის ერთჯერადი ღირებულება',
      oneTimePrice: 15,
      sortOrder: 2,
    },
    {
      code: 'CLEANING',
      name: 'ASG Cleaning Service',
      nameKa: 'ASG- დასუფთავების სერვისი',
      monthlyPrice: 100,
      sortOrder: 3,
    },
    {
      code: 'FINANCIAL_TRANSFER',
      name: 'ASG Financial Transfer Service',
      nameKa: 'ASG-ფინანსური გადარიცხვების სერვისი',
      monthlyPrice: 50,
      sortOrder: 4,
    },
    {
      code: 'FINANCIAL_TRANSFER_VIP',
      name: 'ASG Financial Transfer VIP',
      nameKa: 'ASG-ფინანსური გადარიცხვების სერვისი VIP',
      monthlyPrice: 100,
      sortOrder: 5,
    },
    {
      code: 'SMART_GSM_BARRIER',
      name: 'ASG SMART GSM Barrier Service',
      nameKa: 'ASG- SMART GSM სერვისი შლაგბაუმზე',
      monthlyPrice: 30,
      oneTimePrice: 200,
      sortOrder: 6,
    },
    {
      code: 'SMART_GSM_DOOR',
      name: 'ASG SMART GSM Door Service',
      nameKa: 'ASG- SMART GSM სერვისი კარზე',
      monthlyPrice: 25,
      oneTimePrice: 150,
      sortOrder: 7,
    },
    {
      code: 'ZKT_ACCESS',
      name: 'ASG Additional ZKT Access Service',
      nameKa: 'ASG- დამატებითი ZKT დაშვების სერვისი',
      monthlyPrice: 20,
      oneTimePrice: 100,
      sortOrder: 8,
    },
  ];

  for (const service of services) {
    await prisma.salesService.upsert({
      where: { code: service.code },
      update: {
        name: service.name,
        nameKa: service.nameKa,
        monthlyPrice: service.monthlyPrice,
        oneTimePrice: service.oneTimePrice,
        sortOrder: service.sortOrder,
      },
      create: service,
    });
  }
  console.log(`  ✅ Created ${services.length} sales services`);

  // ==================== PIPELINE CONFIGURATION ====================
  console.log('Creating pipeline configuration...');

  const configs = [
    {
      key: 'HEAD_OF_SALES_POSITION',
      name: 'Head of Sales',
      description: 'Position that approves leads and manages sales team',
      stepOrder: 1,
    },
    {
      key: 'CEO_POSITION',
      name: 'CEO / Executive',
      description: 'Position that creates team-wide sales plans',
      stepOrder: 2,
    },
    {
      key: 'SALES_MANAGER_POSITION',
      name: 'Sales Manager',
      description: 'Position that can reassign leads',
      stepOrder: 3,
    },
    {
      key: 'ASSIGN_LEADS',
      name: 'Assign Leads',
      description: 'Positions that receive new leads and can assign to other agents',
      stepOrder: 4,
    },
    {
      key: 'APPROVAL_REVIEWERS',
      name: 'Approval Reviewers',
      description: 'Positions that can review and approve leads in the approval stage',
      stepOrder: 5,
    },
  ];

  for (const config of configs) {
    await prisma.salesPipelineConfig.upsert({
      where: { key: config.key },
      update: { 
        name: config.name,
        description: config.description,
        stepOrder: config.stepOrder,
      },
      create: config,
    });
  }
  console.log(`  ✅ Created ${configs.length} pipeline configurations`);

  // ==================== PIPELINE PERMISSIONS ====================
  console.log('Creating pipeline permissions...');

  const pipelinePermissions = [
    {
      permissionKey: 'MOVE_LEAD_BACKWARD',
      name: 'Move Lead Backward',
      description: 'Can move leads to previous stages in the pipeline',
    },
    {
      permissionKey: 'REASSIGN_LEAD',
      name: 'Reassign Lead',
      description: 'Can reassign leads to other employees',
    },
    {
      permissionKey: 'VIEW_ALL_LEADS',
      name: 'View All Leads',
      description: 'Can view all leads, not just own leads',
    },
    {
      permissionKey: 'APPROVE_LEADS',
      name: 'Approve Leads',
      description: 'Can approve, unlock, or cancel leads in approval stage',
    },
    {
      permissionKey: 'CREATE_TEAM_PLANS',
      name: 'Create Team Plans',
      description: 'Can create sales plans for the entire team',
    },
    {
      permissionKey: 'CREATE_INDIVIDUAL_PLANS',
      name: 'Create Individual Plans',
      description: 'Can create sales plans for individual employees',
    },
  ];

  for (const perm of pipelinePermissions) {
    await prisma.salesPipelinePermission.upsert({
      where: { permissionKey: perm.permissionKey },
      update: { name: perm.name, description: perm.description },
      create: perm,
    });
  }
  console.log(`  ✅ Created ${pipelinePermissions.length} pipeline permissions`);

  // ==================== STANDARD PERMISSIONS ====================
  console.log('Creating standard permissions...');

  const permissions = [
    // Sales Leads
    { resource: 'sales.leads', action: 'view_own', description: 'View own leads only', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'view_team', description: 'View team leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'view_all', description: 'View all leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'create', description: 'Create new leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'edit_own', description: 'Edit own leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'edit_all', description: 'Edit any lead', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'delete', description: 'Delete leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'change_stage', description: 'Change lead stage', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'move_backward', description: 'Move lead to previous stage', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'submit_approval', description: 'Submit lead for approval', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'approve', description: 'Approve/unlock/cancel leads', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'reassign', description: 'Reassign leads to other employees', category: PermissionCategory.SALES },
    { resource: 'sales.leads', action: 'view_activity', description: 'View lead activity log', category: PermissionCategory.SALES },

    // Sales Services
    { resource: 'sales.services', action: 'view', description: 'View services catalog', category: PermissionCategory.SALES },
    { resource: 'sales.services', action: 'manage', description: 'Create/edit/delete services', category: PermissionCategory.SALES },

    // Sales Plans
    { resource: 'sales.plans', action: 'view_own', description: 'View own sales plans', category: PermissionCategory.SALES },
    { resource: 'sales.plans', action: 'view_team', description: 'View team sales plans', category: PermissionCategory.SALES },
    { resource: 'sales.plans', action: 'view_all', description: 'View all sales plans', category: PermissionCategory.SALES },
    { resource: 'sales.plans', action: 'create_team', description: 'Create team-wide plans (CEO)', category: PermissionCategory.SALES },
    { resource: 'sales.plans', action: 'create_individual', description: 'Create individual plans (Head)', category: PermissionCategory.SALES },
    { resource: 'sales.plans', action: 'edit', description: 'Edit sales plans', category: PermissionCategory.SALES },

    // Sales Config
    { resource: 'sales.config', action: 'manage', description: 'Manage sales pipeline configuration', category: PermissionCategory.SALES },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: perm.resource,
          action: perm.action,
        },
      },
      update: { description: perm.description, category: perm.category },
      create: perm,
    });
  }
  console.log(`  ✅ Created ${permissions.length} standard permissions`);

  console.log('\n🎉 Sales CRM seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
