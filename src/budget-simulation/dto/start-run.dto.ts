import { IsInt, IsObject, IsOptional, IsArray, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsRecordOfNumbers, transformRecordToNumbers } from './validators';

/**
 * Request body for POST /budget/start-run.
 */
export class StartRunDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    moduleId: number;

    @IsInt()
    @Min(1)
    @Type(() => Number)
    jobId: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Type(() => Number)
    monthlyIncome?: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Type(() => Number)
    lifestyleOptionIds?: number[];

    /** Map commitmentTemplateId -> selectedAmount */
    @Transform(transformRecordToNumbers)
    @IsObject()
    @IsRecordOfNumbers()
    commitmentAmounts: Record<string, number>;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Type(() => Number)
    estimatedUtilities?: number;
}
