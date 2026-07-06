import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ProductTrackStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductListing, ProductMatchResult } from './product-scorer.service';

export interface PriceDrop {
  trackedId: string;
  title: string;
  previousPrice: number;
  newPrice: number;
  dropPct: number;
}

/**
 * Product tracking, price history, and duplicate prevention for the Shopping
 * Agent. The (userId, site, externalProductId) unique constraint dedupes, and
 * each price observation is appended to priceHistory for drop detection.
 */
@Injectable()
export class ShoppingTrackerService {
  private readonly logger = new Logger(ShoppingTrackerService.name);

  constructor(private prisma: PrismaService) {}

  async alreadySeen(userId: string, site: string, externalProductId: string): Promise<boolean> {
    const existing = await this.prisma.trackedProduct.findUnique({
      where: { userId_site_externalProductId: { userId, site, externalProductId } },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Record/update a scored product and append the observed price to history. */
  async record(
    userId: string,
    product: ProductListing,
    match: ProductMatchResult,
    status: ProductTrackStatus,
  ) {
    const existing = await this.prisma.trackedProduct.findUnique({
      where: {
        userId_site_externalProductId: {
          userId,
          site: product.site,
          externalProductId: product.externalProductId,
        },
      },
      select: { priceHistory: true },
    });

    const history = Array.isArray(existing?.priceHistory)
      ? (existing!.priceHistory as Prisma.JsonArray)
      : [];
    if (typeof product.price === 'number') {
      history.push({ price: product.price, at: new Date().toISOString() } as Prisma.JsonObject);
    }

    return this.prisma.trackedProduct.upsert({
      where: {
        userId_site_externalProductId: {
          userId,
          site: product.site,
          externalProductId: product.externalProductId,
        },
      },
      update: {
        title: product.title,
        brand: product.brand ?? null,
        url: product.url ?? null,
        currency: product.currency ?? 'INR',
        lastPrice: product.price ?? undefined,
        rating: product.rating ?? null,
        score: match.score,
        matchReasons: match.reasons as unknown as Prisma.InputJsonValue,
        priceHistory: history as unknown as Prisma.InputJsonValue,
        status,
      },
      create: {
        userId,
        site: product.site,
        externalProductId: product.externalProductId,
        title: product.title,
        brand: product.brand ?? null,
        url: product.url ?? null,
        currency: product.currency ?? 'INR',
        lastPrice: product.price ?? null,
        rating: product.rating ?? null,
        score: match.score,
        matchReasons: match.reasons as unknown as Prisma.InputJsonValue,
        priceHistory: history as unknown as Prisma.InputJsonValue,
        status,
      },
    });
  }

  /** Add a product to the price watchlist with a target price. */
  async watch(userId: string, product: ProductListing, targetPrice?: number) {
    const match: ProductMatchResult = { score: 0, qualifies: false, reasons: [], breakdown: {} };
    const row = await this.record(userId, product, match, 'WATCHING');
    if (targetPrice !== undefined) {
      return this.prisma.trackedProduct.update({
        where: { id: row.id },
        data: { targetPrice },
      });
    }
    return row;
  }

  /**
   * Apply a fresh price observation to a watched product. Returns a PriceDrop
   * when the new price falls by >= dropPct (default 10%) or hits the target.
   */
  async observePrice(trackedId: string, newPrice: number, dropPct = 10): Promise<PriceDrop | null> {
    const row = await this.prisma.trackedProduct.findUnique({ where: { id: trackedId } });
    if (!row) return null;

    const history = Array.isArray(row.priceHistory) ? (row.priceHistory as Prisma.JsonArray) : [];
    history.push({ price: newPrice, at: new Date().toISOString() } as Prisma.JsonObject);

    await this.prisma.trackedProduct.update({
      where: { id: trackedId },
      data: { lastPrice: newPrice, priceHistory: history as unknown as Prisma.InputJsonValue },
    });

    const prev = row.lastPrice ?? undefined;
    const hitTarget = row.targetPrice != null && newPrice <= row.targetPrice;
    const dropped =
      typeof prev === 'number' && prev > 0 && ((prev - newPrice) / prev) * 100 >= dropPct;

    if (hitTarget || dropped) {
      return {
        trackedId,
        title: row.title,
        previousPrice: prev ?? newPrice,
        newPrice,
        dropPct: prev ? Math.round(((prev - newPrice) / prev) * 100) : 0,
      };
    }
    return null;
  }

  async markPurchased(id: string, sessionId?: string) {
    return this.prisma.trackedProduct.update({
      where: { id },
      data: { status: 'PURCHASED', purchasedAt: new Date(), sessionId: sessionId ?? undefined },
    });
  }

  async setStatus(id: string, status: ProductTrackStatus) {
    return this.prisma.trackedProduct.update({ where: { id }, data: { status } });
  }

  async list(userId: string, status?: ProductTrackStatus, take = 100) {
    return this.prisma.trackedProduct.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  async stats(userId: string) {
    const rows = await this.prisma.trackedProduct.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = r._count._all;
    return {
      matched: counts['MATCHED'] || 0,
      skipped: counts['SKIPPED'] || 0,
      watching: counts['WATCHING'] || 0,
      pendingApproval: counts['PENDING_APPROVAL'] || 0,
      purchased: counts['PURCHASED'] || 0,
      failed: counts['FAILED'] || 0,
    };
  }
}
