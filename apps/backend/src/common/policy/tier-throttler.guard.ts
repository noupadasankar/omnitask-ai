import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RATE_LIMIT_TIERS, UserTier } from './policy.types';

@Injectable()
export class TierThrottlerGuard extends ThrottlerGuard {
  constructor(protected readonly options: any, protected readonly storageService: ThrottlerStorage, protected readonly reflector: Reflector) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user;
    if (user) {
      return `${user.id}_${user.role || 'USER'}`;
    }
    return req.ip || 'anonymous';
  }

  protected async getLimitAndWindow(req: Record<string, any>): Promise<{ limit: number; window: number }> {
    const user = req.user;
    let tier: UserTier = 'free';
    if (user) {
      const roleToTier: Record<string, UserTier> = {
        SUPER_ADMIN: 'admin',
        ADMIN: 'admin',
        ENTERPRISE: 'enterprise',
        PREMIUM: 'premium',
        BASIC: 'basic',
        USER: 'free',
      };
      tier = roleToTier[user.role] || (user.tier || 'free');
    }

    const config = RATE_LIMIT_TIERS[tier] || RATE_LIMIT_TIERS.free;
    return { limit: config.maxRequests, window: config.windowMs };
  }
}
