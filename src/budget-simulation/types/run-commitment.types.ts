/**
 * Input types for run commitment updates (API-aligned).
 */

/** One optional template line: id, amount, include flag. */
export type OptionalCommitmentUpdateInput = {
  id: number;
  amount: number;
  include: boolean;
};

/** Result of updateRunCommitments. */
export type UpdateRunCommitmentsResult = {
  updated: number;
};

/**
 * Mutable commitment snapshot inside a single transaction
 * (mirrors DB row fields needed for category / effective-range logic).
 */
export type RunCommitmentWorkingRow = {
  commitmentTemplateId: bigint;
  selectedAmount: number;
  effectiveFromMonthIndex: number;
  effectiveToMonthIndex: number | null;
  template: { category: string };
};
