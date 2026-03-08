import { IsInt, IsObject, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsRecordOfNumbers, transformKeysToNumbers, } from './validators';

/**
 * Request body for POST /budget/start-month.
 */
export class StartMonthDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  runId: number;

  /** Map jarCode -> amount */
  @Transform(transformKeysToNumbers)
  @IsObject()
  @IsRecordOfNumbers()
  allocations: Record<string, number>;

  @IsString()
  billReserveOptionCode: string;

  @IsString()
  spendModeCode: string;
}
