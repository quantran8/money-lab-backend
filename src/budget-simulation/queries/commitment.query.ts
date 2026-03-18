import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import {
  BILL_RESERVE_OPTIONS,
  SPEND_MODE_OPTIONS,
} from '../budget-simulation.constant';
import { CommitmentLayer } from '../budget-simulation.enum';

/** Shape of CommitmentTemplate.impact JSON (hi, lqi, utility_modifiers). */
export interface CommitmentTemplateImpact {
  hi?: number;
  lqi?: number;
  utility_modifiers?: Array<{ name: string; modifier: number }>;
}

/** Parses impact JSON from DB; returns safe default when invalid. */
function parseImpact(impact: Prisma.JsonValue): CommitmentTemplateImpact {
  if (impact == null || typeof impact !== 'object' || Array.isArray(impact))
    return {};
  const o = impact as Record<string, unknown>;
  const list = o.utility_modifiers;
  const utility_modifiers = Array.isArray(list)
    ? list
        .filter(
          (m): m is { name: string; modifier: number } =>
            m != null &&
            typeof m === 'object' &&
            typeof (m as { name?: unknown }).name === 'string' &&
            typeof (m as { modifier?: unknown }).modifier === 'number',
        )
        .map((m) => ({ name: m.name, modifier: m.modifier }))
    : undefined;
  return {
    hi: typeof o.hi === 'number' ? o.hi : undefined,
    lqi: typeof o.lqi === 'number' ? o.lqi : undefined,
    utility_modifiers,
  };
}

/** Flattened housing modifier row (from impact or legacy table). */
export interface HousingModifierRow {
  housingCommitmentId: bigint;
  utilityName: string;
  multiplier: number;
}

/**
 * Data access for commitment templates, housing modifiers (from impact), bill reserve and spend mode options.
 * Encapsulates Prisma query shapes; services call intent-based methods only.
 */
@Injectable()
export class CommitmentQuery {
  constructor(private readonly prisma: PrismaService) {}

  /** Template id and category for given ids (e.g. for update-run-commitments category checks). */
  async findTemplatesByIds(
    ids: bigint[],
  ): Promise<{ id: bigint; category: string }[]> {
    if (ids.length === 0) return [];
    return this.prisma.commitmentTemplate.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true },
    });
  }

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
      where: { moduleId, layer: CommitmentLayer.bills },
    });
  }

  /** Bill-layer templates for module (by layer). */
  async findBillTemplatesByLayer(moduleId: number, layer: string) {
    return this.prisma.commitmentTemplate.findMany({
      where: { moduleId, layer },
    });
  }

  /** Housing utility modifiers by housing commitment template ids (from CommitmentTemplate.impact). */
  async findHousingModifiersByCommitmentIds(
    commitmentIds: bigint[],
  ): Promise<HousingModifierRow[]> {
    if (commitmentIds.length === 0) return [];
    const templates = await this.prisma.commitmentTemplate.findMany({
      where: { id: { in: commitmentIds }, category: 'housing' },
      select: { id: true, impact: true },
    });
    const rows: HousingModifierRow[] = [];
    for (const t of templates) {
      const impact = parseImpact(t.impact);
      for (const um of impact.utility_modifiers ?? []) {
        rows.push({
          housingCommitmentId: t.id,
          utilityName: um.name,
          multiplier: um.modifier,
        });
      }
    }
    return rows;
  }

  /** All housing utility modifiers (from CommitmentTemplate.impact, for setup options). */
  async findHousingModifiersAll(): Promise<HousingModifierRow[]> {
    const templates = await this.prisma.commitmentTemplate.findMany({
      where: { category: 'housing' },
      select: { id: true, impact: true },
    });
    const rows: HousingModifierRow[] = [];
    for (const t of templates) {
      const impact = parseImpact(t.impact);
      for (const um of impact.utility_modifiers ?? []) {
        rows.push({
          housingCommitmentId: t.id,
          utilityName: um.name,
          multiplier: um.modifier,
        });
      }
    }
    return rows;
  }

  /** Bill reserve options from constant (sorted by array order). */
  async findActiveBillReserveOptions() {
    return BILL_RESERVE_OPTIONS.map((o, i) => ({
      code: o.code,
      coveragePct: o.coveragePct,
      label: o.label,
      description: undefined as string | undefined,
      sortOrder: i,
    }));
  }

  /** Bill reserve option by code; returns null if code not in constant. */
  async findBillReserveOptionByCode(code: string) {
    const o = BILL_RESERVE_OPTIONS.find((x) => x.code === code);
    return o
      ? { code: o.code, coveragePct: o.coveragePct, label: o.label }
      : null;
  }

  /** Spend mode options from constant (sorted by array order). */
  async findActiveSpendModeOptions() {
    return SPEND_MODE_OPTIONS.map((o, i) => ({
      code: o.code,
      rate: o.rate,
      label: o.label,
      description: undefined as string | undefined,
      sortOrder: i,
    }));
  }

  /** Spend mode option by code; returns null if code not in constant. */
  async findSpendModeOptionByCode(code: string) {
    const o = SPEND_MODE_OPTIONS.find((x) => x.code === code);
    return o ? { code: o.code, rate: o.rate, label: o.label } : null;
  }
}
