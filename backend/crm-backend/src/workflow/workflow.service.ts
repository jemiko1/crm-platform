import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  // ===== WORKFLOW STEPS =====

  async findAllSteps() {
    return this.prisma.workflowStep.findMany({
      orderBy: { stepOrder: "asc" },
      include: {
        assignedPositions: {
          include: {
            position: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });
  }

  async findStepById(id: string) {
    const step = await this.prisma.workflowStep.findUnique({
      where: { id },
      include: {
        assignedPositions: {
          include: {
            position: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!step) {
      throw new NotFoundException(`Workflow step with ID ${id} not found`);
    }

    return step;
  }

  async findStepByKey(stepKey: string) {
    const step = await this.prisma.workflowStep.findUnique({
      where: { stepKey },
      include: {
        assignedPositions: {
          include: {
            position: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!step) {
      throw new NotFoundException(`Workflow step with key ${stepKey} not found`);
    }

    return step;
  }

  async updateStep(
    id: string,
    data: {
      stepName?: string;
      description?: string;
      stepOrder?: number;
      workOrderTypes?: string[] | null;
      isActive?: boolean;
    },
  ) {
    await this.findStepById(id); // Ensure exists

    // Build the update data
    const updateData: Prisma.WorkflowStepUpdateInput = {};

    if (data.stepName) updateData.stepName = data.stepName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.stepOrder !== undefined) updateData.stepOrder = data.stepOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    
    // Handle JSON null properly
    if (data.workOrderTypes !== undefined) {
      updateData.workOrderTypes = data.workOrderTypes === null 
        ? Prisma.JsonNull 
        : data.workOrderTypes;
    }

    return this.prisma.workflowStep.update({
      where: { id },
      data: updateData,
      include: {
        assignedPositions: {
          include: {
            position: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });
  }

  // ===== STEP POSITION ASSIGNMENTS =====

  async assignPositionToStep(
    stepId: string,
    positionId: string,
    options?: {
      isPrimaryAssignee?: boolean;
      notificationType?: "TASK" | "NOTIFICATION" | "BOTH";
    },
  ) {
    // Verify step exists
    await this.findStepById(stepId);

    // Verify position exists
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      throw new NotFoundException(`Position with ID ${positionId} not found`);
    }

    // Check if already assigned
    const existing = await this.prisma.workflowStepPosition.findUnique({
      where: {
        workflowStepId_positionId: {
          workflowStepId: stepId,
          positionId,
        },
      },
    });

    if (existing) {
      // Update existing assignment
      return this.prisma.workflowStepPosition.update({
        where: { id: existing.id },
        data: {
          isPrimaryAssignee: options?.isPrimaryAssignee ?? existing.isPrimaryAssignee,
          notificationType: options?.notificationType ?? existing.notificationType,
        },
        include: {
          position: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
    }

    // Create new assignment
    return this.prisma.workflowStepPosition.create({
      data: {
        workflowStepId: stepId,
        positionId,
        isPrimaryAssignee: options?.isPrimaryAssignee ?? true,
        notificationType: options?.notificationType ?? "TASK",
      },
      include: {
        position: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async removePositionFromStep(stepId: string, positionId: string) {
    const assignment = await this.prisma.workflowStepPosition.findUnique({
      where: {
        workflowStepId_positionId: {
          workflowStepId: stepId,
          positionId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException("Position assignment not found");
    }

    return this.prisma.workflowStepPosition.delete({
      where: { id: assignment.id },
    });
  }

  async setStepPositions(
    stepId: string,
    positionIds: string[],
    options?: {
      isPrimaryAssignee?: boolean;
      notificationType?: "TASK" | "NOTIFICATION" | "BOTH";
    },
  ) {
    await this.findStepById(stepId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workflowStepPosition.deleteMany({
        where: { workflowStepId: stepId },
      });

      if (positionIds.length > 0) {
        const positions = await tx.position.findMany({
          where: { id: { in: positionIds } },
        });

        if (positions.length !== positionIds.length) {
          throw new BadRequestException("One or more positions not found");
        }

        await tx.workflowStepPosition.createMany({
          data: positionIds.map((positionId) => ({
            workflowStepId: stepId,
            positionId,
            isPrimaryAssignee: options?.isPrimaryAssignee ?? true,
            notificationType: options?.notificationType ?? "TASK",
          })),
        });
      }
    });

    return this.findStepById(stepId);
  }

  // ===== UTILITY METHODS =====

  async getPositionsForStep(stepKey: string) {
    const step = await this.findStepByKey(stepKey);

    return step.assignedPositions.map((ap) => ap.position);
  }

  async getEmployeesForStep(stepKey: string) {
    const positions = await this.getPositionsForStep(stepKey);
    const positionIds = positions.map((p) => p.id);

    return this.prisma.employee.findMany({
      where: {
        positionId: { in: positionIds },
        status: "ACTIVE",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeId: true,
        position: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  // Get all active positions for dropdown
  async getAllPositions() {
    return this.prisma.position.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        level: true,
      },
    });
  }
}
