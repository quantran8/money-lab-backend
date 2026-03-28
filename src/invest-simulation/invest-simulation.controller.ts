import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '#app/auth/auth.guard.js';
import { getUserId } from '#common/utils/auth.utils.js';
import { InvestSimulationService } from './invest-simulation.service.js';
import { BuyOrderDto, SellOrderDto } from './dto/index.js';

@Controller('invest-simulation')
@UseGuards(AuthGuard)
export class InvestController {
  constructor(private readonly investService: InvestSimulationService) {}

  // ── Market ───────────────────────────────────────────────────────

  @Get('market/state')
  getMarketState() {
    return this.investService.getMarketState();
  }

  @Get('market/prices')
  getMarketPrices() {
    return this.investService.getMarketPrices();
  }

  // ── Sectors ─────────────────────────────────────────────────────

  @Get('sectors')
  getSectors() {
    return this.investService.getSectors();
  }



  // ── Assets ───────────────────────────────────────────────────────

  @Get('assets')
  getAssets(
    @Query('sectorId') sectorId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.investService.getAssets(
      {
        sectorId: sectorId ? parseInt(sectorId, 10) : undefined,
        search: search || undefined,
      },
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get('assets/:id')
  getAssetDetail(@Param('id') id: string) {
    return this.investService.getAssetDetail(BigInt(id));
  }

  // ── Portfolio ────────────────────────────────────────────────────

  @Get('portfolio')
  getPortfolio(@Request() req: { user?: { id: string } }) {
    return this.investService.getPortfolio(getUserId(req));
  }

  @Get('portfolio/positions')
  getPositions(@Request() req: { user?: { id: string } }) {
    return this.investService.getPositions(getUserId(req));
  }

  @Get('portfolio/transactions')
  getTransactions(
    @Request() req: { user?: { id: string } },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.investService.getTransactions(
      getUserId(req),
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  // ── Trading ──────────────────────────────────────────────────────

  @Post('orders/buy')
  executeBuy(
    @Request() req: { user?: { id: string } },
    @Body() body: BuyOrderDto,
  ) {
    return this.investService.executeBuy(
      getUserId(req),
      BigInt(body.assetId),
      body.quantity,
    );
  }

  @Post('orders/sell')
  executeSell(
    @Request() req: { user?: { id: string } },
    @Body() body: SellOrderDto,
  ) {
    return this.investService.executeSell(
      getUserId(req),
      BigInt(body.assetId),
      body.quantity,
    );
  }

  // ── News ─────────────────────────────────────────────────────────

  @Get('news')
  getNewsFeed(@Query('limit') limit?: string) {
    return this.investService.getNewsFeed(
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('news/:id')
  getNewsById(@Param('id') id: string) {
    return this.investService.getNewsById(BigInt(id));
  }

  // ── Internal: Tick Engine ────────────────────────────────────────

  @Post('internal/run-tick')
  runTick() {
    return this.investService.runTick();
  }

  // ── Score & Stability ──────────────────────────────────────────

  @Get('score')
  getUserScore(@Request() req: { user?: { id: string } }) {
    return this.investService.getUserScore(getUserId(req));
  }

  @Get('stability')
  getUserStability(@Request() req: { user?: { id: string } }) {
    return this.investService.getUserStability(getUserId(req));
  }

  @Post('internal/evaluate-users')
  evaluateUsers() {
    return this.investService.evaluateAllUsers();
  }

  // ── Reflections ────────────────────────────────────────────────

  @Get('reflections')
  getReflections(@Request() req: { user?: { id: string } }) {
    return this.investService.getUserReflections(getUserId(req));
  }

  // ── Missions ───────────────────────────────────────────────────

  @Get('missions')
  getMissions(@Request() req: { user?: { id: string } }) {
    return this.investService.getUserMissions(getUserId(req));
  }

  // ── Reports ────────────────────────────────────────────────────

  @Get('reports/latest')
  getLatestReport(@Request() req: { user?: { id: string } }) {
    return this.investService.getLatestReport(getUserId(req));
  }
}
