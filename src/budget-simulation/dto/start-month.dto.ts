import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsRecordOfNumbers, transformKeysToNumbers } from './validators';

/**
 * Request body for POST /budget/start-month.
 */
export class StartMonthDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  runId: number;

  /** Map jarCode -> amount (from this month's income). */
  @Transform(transformKeysToNumbers)
  @IsObject()
  @IsRecordOfNumbers()
  allocations: Record<string, number>;

  /**
   * Optional. Map jarCode -> amount to carry over from previous month into each jar.
   * Only keys fun, learning, give, future_you. Must satisfy carryOver + convertToFreeCashByJar <= prev balance.
   */
  @IsOptional()
  @Transform(transformKeysToNumbers)
  @IsObject()
  @IsRecordOfNumbers()
  carryOverByJar?: Record<string, number>;

  /**
   * Optional. Map jarCode -> amount from each jar converted to free cash (moved to free cash pool).
   * Only keys fun, learning, give, future_you. Must satisfy carryOverByJar + convertToFreeCashByJar <= prev balance.
   */
  @IsOptional()
  @Transform(transformKeysToNumbers)
  @IsObject()
  @IsRecordOfNumbers()
  convertToFreeCashByJar?: Record<string, number>;

  @IsString()
  billReserveOptionCode: string;

  @IsString()
  spendModeCode: string;
}
