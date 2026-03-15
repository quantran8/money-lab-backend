/**
 * Domain layer barrel. Pure logic only; no DB, no NestJS.
 */
export {
  buildJarAvailableMap,
  computeWeeklySpend,
  jarAvailable,
} from './spending/spending-calculator';
export type {
  WeeklySpendInput,
  WeeklySpendResult,
  JarState,
  SpendOp,
  WeeklySpendEntry,
  WeeklySpendSummary,
} from './spending/spending-calculator';
export type {
  BillReconcileJarState,
  BillsInput,
  BillsResult,
} from './bills/bill-reconcile-calculator';
export {
  computeBills,
  reconcile as billsReconcile,
} from './bills/bill-reconcile-calculator';
export {
  getRecoveryEfficiencyForState,
  resolveWeek as indexResolveWeek,
} from './index/index-calculator';
export type {
  RecoveryEfficiencyResult,
  WeeklyIndexInput,
  WeeklyIndexResult,
  WeeklyIndexProgressItem,
  LqiStateType,
} from './index/index-calculator';
export {
  chooseCategory,
  chooseTemplate,
  chooseTemplateIfSpawn,
  shouldSpawn,
} from './events/event-spawn-engine';
export type {
  EventPoolWeight,
  EventTemplateRef,
} from './events/event-spawn-engine';
