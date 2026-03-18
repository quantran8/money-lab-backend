import { IsInt, Min, Max, IsString, IsOptional, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

/** Single entry in the payment record (jar code + amount deducted). */
export type PaymentRecordEntry = { jar: string; amount: number };

/**
 * Request body for POST /budget/apply-event-choice.
 * Option cost is paid from paymentJarCode first; if shortfall, cover jars are used in order.
 */
export class ApplyEventChoiceDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    monthId: number;

    @IsInt()
    @Min(1)
    @Max(4)
    @Type(() => Number)
    week: number;

    @IsInt()
    @Min(1)
    @Type(() => Number)
    optionId: number;

    /** When multiple pending events in the same week (module 3), target this budget_month_events row. */
    @IsOptional()
    @IsInt()
    @Min(1)
    @Type(() => Number)
    eventId?: number;

    /** Jar selected for payment (primary). UI may preselect from option.default_jar_code. */
    @IsString()
    paymentJarCode: string;

    /** Jars to cover shortfall, in the order the player selects (allocation order). */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(0)
    coverJarCodes?: string[];
}
