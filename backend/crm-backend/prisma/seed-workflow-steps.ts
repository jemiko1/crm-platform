import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const DEFAULT_WORKFLOW_STEPS = [
  {
    stepKey: "ASSIGN_EMPLOYEES",
    stepName: "Assign Employees",
    description: "Head of Technical Department assigns employees to the work order",
    stepOrder: 1,
    triggerStatus: "CREATED",
    requiredAction: "assign",
    workOrderTypes: null, // All types
  },
  {
    stepKey: "START_WORK",
    stepName: "Start Work",
    description: "Assigned technical employee starts work on the order",
    stepOrder: 2,
    triggerStatus: "LINKED_TO_GROUP",
    requiredAction: "start",
    workOrderTypes: null, // All types
  },
  {
    stepKey: "SUBMIT_PRODUCTS",
    stepName: "Submit Products Used",
    description: "Technical employee records products used during the work",
    stepOrder: 3,
    triggerStatus: "IN_PROGRESS",
    requiredAction: "manage_products",
    workOrderTypes: ["INSTALLATION", "REPAIR_CHANGE"], // Only these types
  },
  {
    stepKey: "SUBMIT_DEVICES",
    stepName: "Submit Deactivated Devices",
    description: "Technical employee records devices removed from the building",
    stepOrder: 3,
    triggerStatus: "IN_PROGRESS",
    requiredAction: "manage_devices",
    workOrderTypes: ["DEACTIVATE"], // Only deactivation
  },
  {
    stepKey: "SUBMIT_COMPLETION",
    stepName: "Submit Completion",
    description: "Technical employee submits work completion with comments",
    stepOrder: 4,
    triggerStatus: "IN_PROGRESS",
    requiredAction: "complete",
    workOrderTypes: null, // All types
  },
  {
    stepKey: "FINAL_APPROVAL",
    stepName: "Final Approval",
    description: "Head of Technical Department reviews and approves/rejects the work",
    stepOrder: 5,
    triggerStatus: "IN_PROGRESS",
    condition: "techEmployeeComment != null",
    requiredAction: "approve",
    workOrderTypes: null, // All types
  },
];

async function main() {
  console.log("🌱 Seeding workflow steps...");

  // Get positions to link
  const headOfTechPosition = await prisma.position.findFirst({
    where: {
      OR: [
        { code: { contains: "HEAD", mode: "insensitive" } },
        { code: { contains: "TECHNICAL", mode: "insensitive" } },
        { name: { contains: "Head", mode: "insensitive" } },
        { name: { contains: "Technical", mode: "insensitive" } },
      ],
    },
  });

  const techEmployeePosition = await prisma.position.findFirst({
    where: {
      AND: [
        {
          OR: [
            { code: { contains: "TECH", mode: "insensitive" } },
            { name: { contains: "Technical", mode: "insensitive" } },
            { name: { contains: "Technician", mode: "insensitive" } },
          ],
        },
        {
          NOT: {
            OR: [
              { code: { contains: "HEAD", mode: "insensitive" } },
              { name: { contains: "Head", mode: "insensitive" } },
            ],
          },
        },
      ],
    },
  });

  let created = 0;
  let updated = 0;

  for (const step of DEFAULT_WORKFLOW_STEPS) {
    const existing = await prisma.workflowStep.findUnique({
      where: { stepKey: step.stepKey },
    });

    const workflowStep = await prisma.workflowStep.upsert({
      where: { stepKey: step.stepKey },
      update: {
        stepName: step.stepName,
        description: step.description,
        stepOrder: step.stepOrder,
        triggerStatus: step.triggerStatus,
        condition: step.condition,
        requiredAction: step.requiredAction,
        workOrderTypes: step.workOrderTypes === null ? Prisma.JsonNull : step.workOrderTypes,
      },
      create: {
        stepKey: step.stepKey,
        stepName: step.stepName,
        description: step.description,
        stepOrder: step.stepOrder,
        triggerStatus: step.triggerStatus,
        condition: step.condition,
        requiredAction: step.requiredAction,
        workOrderTypes: step.workOrderTypes === null ? Prisma.JsonNull : step.workOrderTypes,
      },
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }

    // Assign positions based on step type
    const isHeadStep = ["ASSIGN_EMPLOYEES", "FINAL_APPROVAL"].includes(step.stepKey);
    const isTechStep = ["START_WORK", "SUBMIT_PRODUCTS", "SUBMIT_DEVICES", "SUBMIT_COMPLETION"].includes(step.stepKey);

    const positionToAssign = isHeadStep ? headOfTechPosition : isTechStep ? techEmployeePosition : null;

    if (positionToAssign) {
      // Check if assignment already exists
      const existingAssignment = await prisma.workflowStepPosition.findUnique({
        where: {
          workflowStepId_positionId: {
            workflowStepId: workflowStep.id,
            positionId: positionToAssign.id,
          },
        },
      });

      if (!existingAssignment) {
        await prisma.workflowStepPosition.create({
          data: {
            workflowStepId: workflowStep.id,
            positionId: positionToAssign.id,
            isPrimaryAssignee: true,
            notificationType: "TASK",
          },
        });
        console.log(`  → Assigned "${positionToAssign.name}" to step "${step.stepName}"`);
      }
    }
  }

  console.log(`✅ Workflow steps seeded: ${created} created, ${updated} updated`);
  console.log(`📊 Total workflow steps: ${DEFAULT_WORKFLOW_STEPS.length}`);

  if (headOfTechPosition) {
    console.log(`👤 Head of Technical: ${headOfTechPosition.name} (${headOfTechPosition.id})`);
  } else {
    console.log("⚠️  No Head of Technical Department position found");
  }

  if (techEmployeePosition) {
    console.log(`👤 Technical Employee: ${techEmployeePosition.name} (${techEmployeePosition.id})`);
  } else {
    console.log("⚠️  No Technical Employee position found");
  }
}

main()
  .catch((e) => {
    console.error("❌ Error seeding workflow steps:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
