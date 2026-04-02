// ──────────────────────────────────────────────────────────────────
// Pure domain: simulation report aggregation
// No I/O, no NestJS, no DB
// ──────────────────────────────────────────────────────────────────

export interface ReportInput {
  sectorExposure: Record<string, number>;
  assetTypeExposure: Record<string, number>;
  avgVolatility: number;
  stabilityScore: number;
  recentReflections: string[];
}

export interface ReportData {
  sectorExposure: Record<string, number>;
  assetTypeExposure: Record<string, number>;
  avgVolatility: number;
  stabilityScore: number;
  reflectionSummary: string;
}

export function buildReport(input: ReportInput): ReportData {
  const reflectionSummary =
    input.recentReflections.length > 0
      ? input.recentReflections.slice(0, 3).join(' | ')
      : 'No reflections in this period.';

  return {
    sectorExposure: input.sectorExposure,
    assetTypeExposure: input.assetTypeExposure,
    avgVolatility: Math.round(input.avgVolatility * 10000) / 10000,
    stabilityScore: Math.round(input.stabilityScore * 10000) / 10000,
    reflectionSummary,
  };
}
