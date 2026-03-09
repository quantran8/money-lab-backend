import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data access for commitment templates, housing modifiers, bill reserve and spend mode options.
 * Encapsulates Prisma query shapes; services call intent-based methods only.
 */
@Injectable()
export class CommitmentQuery {
  constructor(private readonly prisma: PrismaService) {}

  /** Commitment templates by module and layers, sorted. */
  async findCommitmentTemplates(moduleId: number, layers: string[]) {
    return this.prisma.commitmentTemplate.findMany({
      where: { moduleId, layer: { in: layers } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** All commitment templates sorted (for setup when no filter). */
  async findCommitmentTemplatesAll() {
    return this.prisma.commitmentTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Bill-layer templates for a module. */
  async findBillTemplates(moduleId: number) {
    return this.prisma.commitmentTemplate.findMany({
      where: { moduleId, layer: 'bills' },
    });
  }

  /** Bill-layer templates for module (by layer). */
  async findBillTemplatesByLayer(moduleId: number, layer: string) {
    return this.prisma.commitmentTemplate.findMany({
      where: { moduleId, layer },
    });
  }

  /** Housing utility modifiers by housing commitment template ids. */
  async findHousingModifiersByCommitmentIds(commitmentIds: bigint[]) {
    if (commitmentIds.length === 0) return [];
    return this.prisma.housingUtilityModifier.findMany({
      where: { housingCommitmentId: { in: commitmentIds } },
    });
  }

  /** All housing utility modifiers (for setup options). */
  async findHousingModifiersAll() {
    return this.prisma.housingUtilityModifier.findMany({});
  }

  /** Active bill reserve options, sorted. */
  async findActiveBillReserveOptions() {
    return this.prisma.billReserveOption.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Bill reserve option by code (active). */
  async findBillReserveOptionByCode(code: string) {
    return this.prisma.billReserveOption.findUnique({
      where: { code, isActive: true },
    });
  }

  /** Active spend mode options, sorted. */
  async findActiveSpendModeOptions() {
    return this.prisma.spendModeOption.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Spend mode option by code (active). */
  async findSpendModeOptionByCode(code: string) {
    return this.prisma.spendModeOption.findUnique({
      where: { code, isActive: true },
    });
  }
}
