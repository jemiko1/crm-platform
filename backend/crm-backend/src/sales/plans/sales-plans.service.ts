import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto, QuerySalesPlansDto } from './dto/sales-plan.dto';
import { SalesPlanType, SalesPlanStatus, LeadStatus, Prisma } from '@prisma/client';

@Injectable()
export class SalesPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSalesPlanDto, createdById?: string) {
    // Validate that creator is specified
    if (!createdById && !dto.employeeId) {
      throw new BadRequestException('Either logged in user must be an employee or employeeId must be provided');
    }

    // Validate plan type and period
    if (dto.type === SalesPlanType.MONTHLY && !dto.month) {
      throw new BadRequestException('Month is required for monthly plans');
    }
    if (dto.type === SalesPlanType.QUARTERLY && !dto.quarter) {
      throw new BadRequestException('Quarter is required for quarterly plans');
    }

    // Check for duplicate plan
    const existingWhere: Prisma.SalesPlanWhereInput = {
      type: dto.type,
      year: dto.year,
      employeeId: dto.employeeId || null,
    };

    if (dto.type === SalesPlanType.MONTHLY) {
      existingWhere.month = dto.month;
    } else if (dto.type === SalesPlanType.QUARTERLY) {
      existingWhere.quarter = dto.quarter;
    }

    const existing = await this.prisma.salesPlan.findFirst({
      where: existingWhere,
    });

    if (existing) {
      throw new ConflictException('A plan for this period already exists');
    }

    const actualCreatedById = createdById || dto.employeeId;

    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesPlan.create({
        data: {
          type: dto.type,
          year: dto.year,
          month: dto.type === SalesPlanType.MONTHLY ? dto.month : null,
          quarter: dto.type === SalesPlanType.QUARTERLY ? dto.quarter : null,
          name: dto.name,
          description: dto.description,
          employeeId: dto.employeeId,
          targetRevenue: dto.targetRevenue,
          targetLeadConversions: dto.targetLeadConversions,
          createdById: actualCreatedById!,
        },
      });

      if (dto.targets && dto.targets.length > 0) {
        await tx.salesPlanTarget.createMany({
          data: dto.targets.map((t) => ({
            planId: created.id,
            serviceId: t.serviceId,
            targetQuantity: t.targetQuantity,
            targetRevenue: t.targetRevenue,
          })),
        });
      }

      return created;
    });

    return this.findOne(plan.id);
  }

  async findAll(query: QuerySalesPlansDto) {
    const where: Prisma.SalesPlanWhereInput = {};

    if (query.type) where.type = query.type;
    if (query.year) where.year = query.year;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status as SalesPlanStatus;

    return this.prisma.salesPlan.findMany({
      where,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        targets: {
          include: { service: true },
        },
        _count: { select: { targets: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { quarter: 'desc' }],
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.salesPlan.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        targets: {
          include: { service: true },
          orderBy: { service: { sortOrder: 'asc' } },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Sales plan not found');
    }

    return plan;
  }

  async update(id: string, dto: UpdateSalesPlanDto) {
    const plan = await this.findOne(id);

    if (plan.status !== SalesPlanStatus.DRAFT) {
      throw new BadRequestException('Only draft plans can be edited');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.salesPlan.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          targetRevenue: dto.targetRevenue,
          targetLeadConversions: dto.targetLeadConversions,
        },
      });

      if (dto.targets) {
        await tx.salesPlanTarget.deleteMany({
          where: { planId: id },
        });

        if (dto.targets.length > 0) {
          await tx.salesPlanTarget.createMany({
            data: dto.targets.map((t) => ({
              planId: id,
              serviceId: t.serviceId,
              targetQuantity: t.targetQuantity,
              targetRevenue: t.targetRevenue,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async delete(id: string) {
    const plan = await this.findOne(id);

    if (plan.status !== SalesPlanStatus.DRAFT) {
      throw new BadRequestException('Only draft plans can be deleted');
    }

    await this.prisma.salesPlan.delete({ where: { id } });

    return { success: true };
  }

  async activate(id: string, approvedById: string) {
    const plan = await this.findOne(id);

    if (plan.status !== SalesPlanStatus.DRAFT) {
      throw new BadRequestException('Only draft plans can be activated');
    }

    return this.prisma.salesPlan.update({
      where: { id },
      data: {
        status: SalesPlanStatus.ACTIVE,
        approvedById,
        approvedAt: new Date(),
      },
    });
  }

  async complete(id: string) {
    const plan = await this.findOne(id);

    if (plan.status !== SalesPlanStatus.ACTIVE) {
      throw new BadRequestException('Only active plans can be completed');
    }

    return this.prisma.salesPlan.update({
      where: { id },
      data: { status: SalesPlanStatus.COMPLETED },
    });
  }

  // ==================== PROGRESS TRACKING ====================

  async getMyProgress(employeeId: string) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentQuarter = Math.ceil(currentMonth / 3);

    // Get active plans for the employee
    const plans = await this.prisma.salesPlan.findMany({
      where: {
        OR: [
          { employeeId }, // Individual plans
          { employeeId: null }, // Team-wide plans
        ],
        status: SalesPlanStatus.ACTIVE,
        year: currentYear,
      },
      include: {
        targets: {
          include: { service: true },
        },
      },
    });

    // Calculate achieved values from won leads
    const periodFilter = this.getPeriodFilter(currentYear, currentMonth, currentQuarter);

    // Get services from won leads for this employee
    const wonLeadServices = await this.prisma.leadService.findMany({
      where: {
        lead: {
          responsibleEmployeeId: employeeId,
          status: LeadStatus.WON,
          wonAt: periodFilter,
        },
      },
      include: {
        service: true,
        lead: true,
      },
    });

    // Aggregate by service
    const achievedByService = new Map<string, { quantity: number; revenue: number }>();
    for (const ls of wonLeadServices) {
      const serviceId = ls.serviceId;
      const existing = achievedByService.get(serviceId) || { quantity: 0, revenue: 0 };
      existing.quantity += ls.quantity;
      const monthly = Number(ls.monthlyPrice) || 0;
      const oneTime = Number(ls.oneTimePrice) || 0;
      existing.revenue += (monthly + oneTime) * ls.quantity;
      achievedByService.set(serviceId, existing);
    }

    // Calculate total revenue from won leads
    const wonLeads = await this.prisma.lead.findMany({
      where: {
        responsibleEmployeeId: employeeId,
        status: LeadStatus.WON,
        wonAt: periodFilter,
      },
    });

    const totalAchievedRevenue = wonLeads.reduce((sum, lead) => {
      const monthly = Number(lead.totalMonthlyPrice) || 0;
      const oneTime = Number(lead.totalOneTimePrice) || 0;
      return sum + monthly + oneTime;
    }, 0);

    const achievedLeadConversions = wonLeads.length;

    // Build progress for each plan
    const progress = plans.map((plan) => {
      const targetsProgress = plan.targets.map((target) => {
        const achieved = achievedByService.get(target.serviceId) || { quantity: 0, revenue: 0 };
        return {
          serviceId: target.serviceId,
          serviceName: target.service.name,
          serviceNameKa: target.service.nameKa,
          targetQuantity: target.targetQuantity,
          achievedQuantity: achieved.quantity,
          progressPercent: target.targetQuantity > 0
            ? Math.round((achieved.quantity / target.targetQuantity) * 100)
            : 0,
          targetRevenue: target.targetRevenue,
          achievedRevenue: achieved.revenue,
        };
      });

      return {
        planId: plan.id,
        planType: plan.type,
        year: plan.year,
        month: plan.month,
        quarter: plan.quarter,
        name: plan.name,
        targetRevenue: plan.targetRevenue,
        achievedRevenue: totalAchievedRevenue,
        revenueProgressPercent: plan.targetRevenue
          ? Math.round((totalAchievedRevenue / Number(plan.targetRevenue)) * 100)
          : 0,
        targetLeadConversions: plan.targetLeadConversions,
        achievedLeadConversions,
        leadsProgressPercent: plan.targetLeadConversions
          ? Math.round((achievedLeadConversions / plan.targetLeadConversions) * 100)
          : 0,
        targets: targetsProgress,
      };
    });

    return progress;
  }

  async getTeamDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentQuarter = Math.ceil(currentMonth / 3);

    // Get all employees with active plans
    const employees = await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        salesPlans: {
          some: {
            status: SalesPlanStatus.ACTIVE,
            year: currentYear,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
      },
    });

    // Get progress for each employee
    const teamProgress = await Promise.all(
      employees.map(async (emp) => {
        const progress = await this.getMyProgress(emp.id);
        const monthlyPlan = progress.find(
          (p) => p.planType === SalesPlanType.MONTHLY && p.month === currentMonth,
        );

        return {
          employee: emp,
          monthlyProgress: monthlyPlan || null,
        };
      }),
    );

    // Get team totals
    const periodFilter = this.getPeriodFilter(currentYear, currentMonth, currentQuarter);

    const [totalWonLeads, totalRevenue] = await Promise.all([
      this.prisma.lead.count({
        where: {
          status: LeadStatus.WON,
          wonAt: periodFilter,
        },
      }),
      this.prisma.lead.aggregate({
        where: {
          status: LeadStatus.WON,
          wonAt: periodFilter,
        },
        _sum: {
          totalMonthlyPrice: true,
          totalOneTimePrice: true,
        },
      }),
    ]);

    const sumMonthly = Number(totalRevenue._sum.totalMonthlyPrice) || 0;
    const sumOneTime = Number(totalRevenue._sum.totalOneTimePrice) || 0;

    return {
      period: {
        year: currentYear,
        month: currentMonth,
        quarter: currentQuarter,
      },
      teamTotals: {
        wonLeads: totalWonLeads,
        totalRevenue: sumMonthly + sumOneTime,
      },
      employeeProgress: teamProgress,
    };
  }

  private getPeriodFilter(year: number, month: number, quarter: number) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    return {
      gte: monthStart,
      lte: monthEnd,
    };
  }
}
