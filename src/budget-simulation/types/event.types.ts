import { Prisma } from '@prisma/client';

/** Life event template row from pool queries. */
export type LifeEventTemplateRow = Prisma.LifeEventTemplateGetPayload<
  Record<string, never>
>;

/** Life event template with options included (for affordability check during spawn). */
export type LifeEventTemplateWithOptionsRow =
  Prisma.LifeEventTemplateGetPayload<{ include: { options: true } }>;

export type EventPoolWeightRow = Prisma.EventPoolWeightGetPayload<
  Record<string, never>
>;

export type LifeEventOptionRow = Prisma.LifeEventOptionGetPayload<
  Record<string, never>
>;

/** Option shown on spawn / existing pending event. */
export interface SpawnEventOptionPayload {
  optionId: string;
  optionLabel: string;
  description: string;
  defaultJarCode: string | null;
  moneyDelta: number;
  healthDelta: number;
  lqiDelta: number;
  learningXpDelta: number;
  /** OT accept: amount added to next month BUDGET_RUN_MONTHS.income (not immediate cash). */
  deferredOvertimePayoutNextMonth?: number;
}

/** API-shaped event template for resolve-week / spawn. */
export interface SpawnEventTemplatePayload {
  /** budget_month_events.id — use on apply-event-choice when multiple pending. */
  eventId: string;
  eventSource: string;
  eventSubtype?: string | null;
  templateId: string;
  title: string;
  description: string;
  options: SpawnEventOptionPayload[];
}
