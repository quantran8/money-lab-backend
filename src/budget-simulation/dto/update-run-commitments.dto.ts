import {
  IsObject,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsRecordOfNumbers, transformRecordToNumbers } from './validators';

/** One optional commitment: template id, amount, and whether to include from next month. */
export class OptionalCommitmentItemDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  id: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @IsBoolean()
  @Type(() => Boolean)
  include: boolean;
}

/**
 * Request body for POST /budget-simulation/run/:runId/commitments.
 * Updates selectedAmount for run commitments (templateId -> amount).
 * Optional templates: include true = deactivate up to current month then insert from next month; include false = deactivate only.
 */
export class UpdateRunCommitmentsDto {
  /** Map commitmentTemplateId -> selectedAmount. */
  @Transform(transformRecordToNumbers)
  @IsObject()
  @IsRecordOfNumbers()
  commitmentAmounts: Record<string, number>;

  /** Optional templates: id, amount, include (true = close prev then insert new; false = just deactivate). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionalCommitmentItemDto)
  optionals?: OptionalCommitmentItemDto[];
}
