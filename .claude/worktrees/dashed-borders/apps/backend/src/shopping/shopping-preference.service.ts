import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductScoringPreferences } from './product-scorer.service';

export interface ShoppingPreferenceInput {
  categories?: string[];
  mustHaveFeatures?: string[];
  avoidKeywords?: string[];
  preferredBrands?: string[];
  maxPrice?: number | null;
  minRating?: number;
  minScore?: number;
  autoBuyLimit?: number;
}

const DEFAULTS = {
  categories: [] as string[],
  mustHaveFeatures: [] as string[],
  avoidKeywords: [] as string[],
  preferredBrands: [] as string[],
  maxPrice: null as number | null,
  minRating: 4.0,
  minScore: 60,
  autoBuyLimit: 0,
};

@Injectable()
export class ShoppingPreferenceService {
  constructor(private prisma: PrismaService) {}

  async get(userId: string) {
    const pref = await this.prisma.shoppingPreference.findUnique({ where: { userId } });
    return pref ?? { userId, ...DEFAULTS };
  }

  async save(userId: string, input: ShoppingPreferenceInput) {
    const data = {
      categories: input.categories ?? [],
      mustHaveFeatures: input.mustHaveFeatures ?? [],
      avoidKeywords: input.avoidKeywords ?? [],
      preferredBrands: input.preferredBrands ?? [],
      maxPrice: input.maxPrice ?? null,
      minRating: input.minRating ?? DEFAULTS.minRating,
      minScore: input.minScore ?? DEFAULTS.minScore,
      autoBuyLimit: input.autoBuyLimit ?? DEFAULTS.autoBuyLimit,
    };
    return this.prisma.shoppingPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  toScoringPreferences(pref: {
    categories: string[];
    mustHaveFeatures: string[];
    avoidKeywords: string[];
    preferredBrands: string[];
    maxPrice?: number | null;
    minRating: number;
    minScore: number;
  }): ProductScoringPreferences {
    return {
      categories: pref.categories,
      mustHaveFeatures: pref.mustHaveFeatures,
      avoidKeywords: pref.avoidKeywords,
      preferredBrands: pref.preferredBrands,
      maxPrice: pref.maxPrice ?? null,
      minRating: pref.minRating,
      minScore: pref.minScore,
    };
  }
}
