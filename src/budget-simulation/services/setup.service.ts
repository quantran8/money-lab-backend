import {
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BudgetRunQuery } from '../queries/run.query';
import { CommitmentQuery } from '../queries/commitment.query';
import { CommitmentLayer } from '../budget-simulation.enum';

/**
 * Setup options and reference data for budget simulation.
 * Single entry point: getSetupOptions().
 */
@Injectable()
export class BudgetSimulationSetupService {
  private readonly logger = new Logger(BudgetSimulationSetupService.name);

  constructor(
    private readonly runQuery: BudgetRunQuery,
    private readonly commitmentQuery: CommitmentQuery,
  ) {}

  /**
   * Returns all setup options in one call: jobs, commitmentTemplates,
   * housingUtilityModifiers, billReserveOptions, spendModeOptions.
   */
  async getSetupOptions() {
    try {
      const moduleId = 3;
      const layerList = [
        CommitmentLayer.bills,
        CommitmentLayer.locked,
        CommitmentLayer.foodReserve,
      ];

      const [
        jobsRaw,
        commitmentTemplatesRaw,
        housingUtilityModifiersRaw,
        billReserveOptionsRaw,
        spendModeOptionsRaw,
      ] = await Promise.all([
        this.runQuery.findJobsMany(),
        layerList.length > 0
          ? this.commitmentQuery.findCommitmentTemplates(moduleId, layerList)
          : this.commitmentQuery.findCommitmentTemplatesAll(),
        this.commitmentQuery.findHousingModifiersAll(),
        this.commitmentQuery.findActiveBillReserveOptions(),
        this.commitmentQuery.findActiveSpendModeOptions(),
      ]);

      return {
        jobs: jobsRaw.map((job) => ({ ...job, id: job.id.toString() })),
        commitmentTemplates: commitmentTemplatesRaw.map((t) => ({
          ...t,
          id: t.id.toString(),
        })),
        housingUtilityModifiers: housingUtilityModifiersRaw.map((m) => ({
          ...m,
          id: m.id.toString(),
          housingCommitmentId: m.housingCommitmentId.toString(),
        })),
        billReserveOptions: billReserveOptionsRaw.map((o) => ({
          code: o.code,
          coveragePct: o.coveragePct,
          label: o.label,
          description: o.description ?? undefined,
          sortOrder: o.sortOrder,
        })),
        spendModeOptions: spendModeOptionsRaw.map((o) => ({
          code: o.code,
          rate: Number(o.rate),
          label: o.label,
          description: o.description ?? undefined,
          sortOrder: o.sortOrder,
        })),
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`getSetupOptions: ${msg}`, stack);
      throw err;
    }
  }
}
