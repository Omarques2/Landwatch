import {
  Injectable,
  Inject,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOW_PROVIDER } from './analysis-runner.service';

const CACHE_TTL_MONTHS = 2;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function addMonths(base: Date, months: number): Date {
  const copy = new Date(base);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

@Injectable()
export class AnalysisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly nowProvider: () => Date;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cacheDisabled = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) {
    this.nowProvider = nowProvider ?? (() => new Date());
  }

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired();
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async get<T = Record<string, unknown>>(
    analysisId: string,
  ): Promise<T | null> {
    if (!analysisId) return null;
    if (this.cacheDisabled) return null;
    let cached: { payload: Prisma.JsonValue; expiresAt: Date } | null = null;
    try {
      cached = await this.prisma.analysisCache.findUnique({
        where: { analysisId },
        select: { payload: true, expiresAt: true },
      });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.cacheDisabled = true;
        return null;
      }
      throw err;
    }
    if (!cached) return null;
    const now = this.nowProvider();
    if (cached.expiresAt <= now) {
      try {
        await this.prisma.analysisCache.deleteMany({
          where: { analysisId },
        });
      } catch (err) {
        if (this.isMissingTableError(err)) {
          this.cacheDisabled = true;
          return null;
        }
        throw err;
      }
      return null;
    }
    return cached.payload as T;
  }

  async set(analysisId: string, payload: unknown): Promise<void> {
    if (!analysisId) return;
    if (this.cacheDisabled) return;
    const now = this.nowProvider();
    const expiresAt = addMonths(now, CACHE_TTL_MONTHS);
    const payloadJson = payload as Prisma.InputJsonValue;
    try {
      await this.prisma.analysisCache.upsert({
        where: { analysisId },
        create: {
          analysisId,
          payload: payloadJson,
          cachedAt: now,
          expiresAt,
        },
        update: {
          payload: payloadJson,
          cachedAt: now,
          expiresAt,
        },
      });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.cacheDisabled = true;
        return;
      }
      throw err;
    }
  }

  async cleanupExpired(): Promise<void> {
    if (this.cacheDisabled) return;
    const now = this.nowProvider();
    try {
      await this.prisma.analysisCache.deleteMany({
        where: { expiresAt: { lt: now } },
      });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.cacheDisabled = true;
        return;
      }
      throw err;
    }
  }

  async invalidate(analysisId: string): Promise<void> {
    if (!analysisId) return;
    if (this.cacheDisabled) return;
    try {
      await this.prisma.analysisCache.deleteMany({
        where: { analysisId },
      });
    } catch (err) {
      if (this.isMissingTableError(err)) {
        this.cacheDisabled = true;
        return;
      }
      throw err;
    }
  }

  private isMissingTableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2021') return true;
    }
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === 'string' ? record.message : undefined;
    if (
      message &&
      message.includes('analysis_cache') &&
      message.toLowerCase().includes('does not exist')
    ) {
      return true;
    }
    const cause = record.cause as Record<string, unknown> | undefined;
    const causeMessage =
      typeof cause?.message === 'string' ? cause.message : undefined;
    if (
      causeMessage &&
      causeMessage.includes('analysis_cache') &&
      causeMessage.toLowerCase().includes('does not exist')
    ) {
      return true;
    }
    return false;
  }
}
