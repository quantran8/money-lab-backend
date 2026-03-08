import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request body for POST /budget/resolve-week.
 */
export class ResolveWeekDto {
    @IsInt()
    @Min(1)
    @Type(() => Number)
    monthId: number;
}
