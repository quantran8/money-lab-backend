import { IsEnum, IsOptional } from 'class-validator';
import {
  DEFAULT_BALANCE_CHART_PERIOD,
  type BalanceChartPeriod,
} from '../invest-simulation.constant.js';

const BALANCE_CHART_PERIODS: BalanceChartPeriod[] = ['1d', '1w', '1m', '1y'];

export class BalanceChartQueryDto {
  @IsOptional()
  @IsEnum(BALANCE_CHART_PERIODS, {
    message: `period must be one of: ${BALANCE_CHART_PERIODS.join(', ')}`,
  })
  period: BalanceChartPeriod = DEFAULT_BALANCE_CHART_PERIOD;
}
