/** Domain computeBills output shape. */
export interface BillsComputeResult {
  estimated: number;
  actual: number;
  delta: number;
  reason: string | null;
}
