import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionRunner } from '#app/prisma/transaction.runner.js';
import { wrapAsync } from '#common/utils/async.utils.js';
import { InvestMarketQuery } from '../queries/market.query.js';
import { InvestPortfolioQuery } from '../queries/portfolio.query.js';
import { InvestAssetQuery } from '../queries/asset.query.js';
import { InvestPortfolioRepository } from '../repositories/portfolio.repository.js';
import {
  computeBuyFill,
  computeSellFill,
  computeNewAvgPrice,
} from '../domain/index.js';
import { OrderSide } from '../invest-simulation.enum.js';
import { DEFAULT_STARTING_CREDITS } from '../invest-simulation.constant.js';

@Injectable()
export class InvestTradeService {
  private readonly logger = new Logger(InvestTradeService.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly marketQuery: InvestMarketQuery,
    private readonly portfolioQuery: InvestPortfolioQuery,
    private readonly assetQuery: InvestAssetQuery,
    private readonly portfolioRepo: InvestPortfolioRepository,
  ) {}

  async executeBuy(userId: string, assetId: bigint, quantity: number) {
    return wrapAsync(this.logger, 'executeBuy', async () => {
      // 1. LOAD (parallel)
      const [asset, tick] = await Promise.all([
        this.assetQuery.findById(assetId),
        this.marketQuery.findCurrentTick(),
      ]);

      if (!asset) throw new NotFoundException('Asset not found');
      if (!tick) throw new NotFoundException('No market ticks available');

      const [credit, pricePoint, position] = await Promise.all([
        this.portfolioQuery.findUserCredit(userId),
        this.marketQuery.findLatestPriceForAsset(assetId, tick.id),
        this.portfolioQuery.findPosition(userId, assetId),
      ]);

      if (!pricePoint) throw new NotFoundException('No price available for this asset');

      const balance = credit?.balance ?? 0;

      // 2. COMPUTE (pure domain)
      const fill = computeBuyFill({
        availableCredits: balance,
        pricePerUnit: pricePoint.price,
        quantity,
      });

      if (!fill.valid) {
        throw new BadRequestException(fill.reason);
      }

      const newAvgPrice = computeNewAvgPrice({
        currentQty: position?.quantity ?? 0,
        currentAvgPrice: position?.avgBuyPrice ?? 0,
        addQty: quantity,
        addPrice: pricePoint.price,
      });

      // 3. WRITE (single transaction)
      const result = await this.transactionRunner.run(async (tx) => {
        // Ensure credit row exists
        if (!credit) {
          await this.portfolioRepo.ensureUserCredit(userId, DEFAULT_STARTING_CREDITS, tx);
          // Re-validate after creation
          const newBalance = DEFAULT_STARTING_CREDITS;
          if (fill.totalCost > newBalance) {
            throw new BadRequestException('Insufficient credits');
          }
        }

        // Deduct credits atomically
        const affected = await this.portfolioRepo.deductCredits(
          userId,
          fill.totalCost,
          tx,
        );
        if (affected === 0) {
          throw new BadRequestException('Insufficient credits (concurrent update)');
        }

        // Upsert position
        await this.portfolioRepo.upsertPosition(
          userId,
          assetId,
          quantity,
          newAvgPrice,
          tx,
        );

        // Record transaction
        const txn = await this.portfolioRepo.createTransaction(
          {
            userId,
            assetId,
            tickId: tick.id,
            side: OrderSide.buy,
            quantity,
            pricePerUnit: pricePoint.price,
            totalAmount: fill.totalCost,
          },
          tx,
        );

        return {
          transactionId: txn.id.toString(),
          side: OrderSide.buy,
          assetId: assetId.toString(),
          quantity,
          pricePerUnit: pricePoint.price,
          totalAmount: fill.totalCost,
        };
      });

      return result;
    });
  }

  async executeSell(userId: string, assetId: bigint, quantity: number) {
    return wrapAsync(this.logger, 'executeSell', async () => {
      // 1. LOAD (parallel)
      const [tick, position] = await Promise.all([
        this.marketQuery.findCurrentTick(),
        this.portfolioQuery.findPosition(userId, assetId),
      ]);

      if (!tick) throw new NotFoundException('No market ticks available');
      if (!position) throw new BadRequestException('No position held for this asset');

      const pricePoint = await this.marketQuery.findLatestPriceForAsset(assetId, tick.id);
      if (!pricePoint) throw new NotFoundException('No price available for this asset');

      // 2. COMPUTE (pure domain)
      const fill = computeSellFill({
        heldQuantity: position.quantity,
        pricePerUnit: pricePoint.price,
        quantity,
      });

      if (!fill.valid) {
        throw new BadRequestException(fill.reason);
      }

      // 3. WRITE (single transaction)
      const result = await this.transactionRunner.run(async (tx) => {
        // Add credits
        await this.portfolioRepo.addCredits(userId, fill.totalProceeds, tx);

        // Decrease position
        await this.portfolioRepo.decreasePosition(userId, assetId, quantity, tx);

        // Remove position if quantity reaches zero
        await this.portfolioRepo.deletePositionIfEmpty(userId, assetId, tx);

        // Record transaction
        const txn = await this.portfolioRepo.createTransaction(
          {
            userId,
            assetId,
            tickId: tick.id,
            side: OrderSide.sell,
            quantity,
            pricePerUnit: pricePoint.price,
            totalAmount: fill.totalProceeds,
          },
          tx,
        );

        return {
          transactionId: txn.id.toString(),
          side: OrderSide.sell,
          assetId: assetId.toString(),
          quantity,
          pricePerUnit: pricePoint.price,
          totalAmount: fill.totalProceeds,
        };
      });

      return result;
    });
  }
}
