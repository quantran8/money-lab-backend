import { Injectable } from '@nestjs/common';
import { InvestMarketStateService } from './services/market-state.service.js';
import { AssetService } from './services/asset.service.js';
import { InvestTradeService } from './services/trade.service.js';
import { InvestPortfolioService } from './services/portfolio.service.js';
import { InvestNewsService } from './services/news.service.js';
import { InvestTickService } from './services/tick.service.js';
import { InvestStabilityScoreService } from './services/stability-score.service.js';
import { InvestReflectionService } from './services/reflection.service.js';
import { MissionService } from './services/mission.service.js';
import { InvestReportService } from './services/report.service.js';

@Injectable()
export class InvestSimulationService {
  constructor(
    private readonly marketState: InvestMarketStateService,
    private readonly asset: AssetService,
    private readonly trade: InvestTradeService,
    private readonly portfolio: InvestPortfolioService,
    private readonly news: InvestNewsService,
    private readonly tick: InvestTickService,
    private readonly stabilityScore: InvestStabilityScoreService,
    private readonly reflection: InvestReflectionService,
    private readonly mission: MissionService,
    private readonly report: InvestReportService,
  ) {}

  // ── Market ───────────────────────────────────────────────────────

  async getMarketState() {
    return this.marketState.getCurrentMarketState();
  }

  async getMarketPrices() {
    return this.marketState.getLatestPrices();
  }

  // ── Sectors ─────────────────────────────────────────────────────

  async getSectors() {
    return this.asset.getSectors();
  }

  // ── Assets ───────────────────────────────────────────────────────

  async getAssets(
    filter: { sectorId?: number; search?: string; category?: string } = {},
    limit?: number,
    cursor?: bigint,
  ) {
    return this.asset.getAssetList(filter, limit, cursor);
  }

  async getAssetCategories(sectorId?: number) {
    return this.asset.getCategories(sectorId);
  }

  async getAssetDetail(assetId: bigint) {
    return this.asset.getAssetDetail(assetId);
  }

  // ── Portfolio ────────────────────────────────────────────────────

  async getPortfolio(userId: string) {
    return this.portfolio.getPortfolio(userId);
  }

  async getPositions(userId: string) {
    return this.portfolio.getPositions(userId);
  }

  async getTransactions(userId: string, limit?: number, cursor?: bigint) {
    return this.portfolio.getTransactions(userId, limit, cursor);
  }

  // ── Trading ──────────────────────────────────────────────────────

  async executeBuy(userId: string, assetId: bigint, quantity: number) {
    return this.trade.executeBuy(userId, assetId, quantity);
  }

  async executeSell(userId: string, assetId: bigint, quantity: number) {
    return this.trade.executeSell(userId, assetId, quantity);
  }

  // ── News ─────────────────────────────────────────────────────────

  async getNewsFeed(limit?: number, cursor?: bigint) {
    return this.news.getNewsFeed(limit, cursor);
  }

  async getNewsById(newsId: bigint) {
    return this.news.getNewsById(newsId);
  }

  // ── Internal: Tick Engine ────────────────────────────────────────

  async runTick() {
    return this.tick.runTick();
  }

  // ── Score & Stability ────────────────────────────────────────────

  async getUserScore(userId: string) {
    return this.stabilityScore.getUserScore(userId);
  }

  async getUserStability(userId: string) {
    return this.stabilityScore.getUserStability(userId);
  }

  async evaluateAllUsers() {
    // Use latest tick index
    const state = await this.marketState
      .getCurrentMarketState()
      .catch(() => null);
    const tickIndex = BigInt(state?.tickIndex ?? 0);
    return this.stabilityScore.evaluateAllUsers(tickIndex);
  }

  // ── Reflections ──────────────────────────────────────────────────

  async getUserReflections(userId: string) {
    return this.reflection.getUserReflections(userId);
  }

  // ── Missions ─────────────────────────────────────────────────────

  async getUserMissions(userId: string) {
    return this.mission.getUserMissions(userId);
  }

  // ── Reports ──────────────────────────────────────────────────────

  async getLatestReport(userId: string) {
    return this.report.getLatestReport(userId);
  }
}
