/**
 * Domain layer barrel. Pure logic only; no DB, no NestJS.
 */
export {
  buildJarAvailableMap,
  computeWeeklySpend,
  computeLearningXp,
  computeJobProgress,
  getHiEfficiency,
  jarAvailable,
} from './spending/spending-calculator';
export type {
  WeeklySpendInput,
  WeeklySpendResult,
  LearningXpInput,
  LearningXpResult,
  JobProgressInput,
  JobProgressResult,
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
  filterAffordableTemplates,
  shouldSpawn,
  shouldSpawnLane,
} from './events/event-spawn-engine';
export {
  resolveOvertimeEffectsFromJobLevel,
  isOvertimeAcceptOption,
} from './events/overtime-effects';
export {
  resolveBaseJobIncome,
  calculateMonthIncome,
  resolveOvertimeChoicePersistence,
} from './income/month-income';
export type {
  CalculateMonthIncomeParams,
  OvertimeChoiceResolutionInput,
} from './income/month-income';
export type {
  EventPoolWeight,
  EventTemplateRef,
} from './events/event-spawn-engine';
export { analyzeRun } from './analyze/run-analyzer';
export type {
  AnalyzeRunInput,
  AnalyzeMonthInput,
  AnalyzeMonthJar,
  AnalyzeMonthIndex,
  AnalyzeMonthBill,
  AnalyzeMonthEvent,
  RunAnalysisResult,
  RunOverview,
  IndicesSection,
  FinancialsSection,
  VolatilitySection,
  KeyMoment,
  FinalState,
} from './analyze/run-analyzer';
