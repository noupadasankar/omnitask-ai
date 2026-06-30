import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobScoringPreferences } from './job-match-scorer.service';

export interface JobPreferenceInput {
  roles?: string[];
  locations?: string[];
  requiredKeywords?: string[];
  preferredKeywords?: string[];
  excludeKeywords?: string[];
  skills?: string[];
  minScore?: number;
  dailyLimit?: number;
  remoteOnly?: boolean;
  minSalary?: number | null;
}

const DEFAULTS = {
  roles: [] as string[],
  locations: [] as string[],
  requiredKeywords: [] as string[],
  preferredKeywords: [] as string[],
  excludeKeywords: [] as string[],
  skills: [] as string[],
  minScore: 60,
  dailyLimit: 20,
  remoteOnly: false,
  minSalary: null as number | null,
};

@Injectable()
export class JobPreferenceService {
  constructor(private prisma: PrismaService) {}

  async get(userId: string) {
    const pref = await this.prisma.jobPreference.findUnique({ where: { userId } });
    return pref ?? { userId, ...DEFAULTS };
  }

  async save(userId: string, input: JobPreferenceInput) {
    const data = {
      roles: input.roles ?? [],
      locations: input.locations ?? [],
      requiredKeywords: input.requiredKeywords ?? [],
      preferredKeywords: input.preferredKeywords ?? [],
      excludeKeywords: input.excludeKeywords ?? [],
      skills: input.skills ?? [],
      minScore: input.minScore ?? DEFAULTS.minScore,
      dailyLimit: input.dailyLimit ?? DEFAULTS.dailyLimit,
      remoteOnly: input.remoteOnly ?? DEFAULTS.remoteOnly,
      minSalary: input.minSalary ?? null,
    };
    return this.prisma.jobPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  /** Shape the stored preference for the scorer. */
  toScoringPreferences(pref: {
    roles: string[];
    locations: string[];
    requiredKeywords: string[];
    preferredKeywords: string[];
    excludeKeywords: string[];
    skills: string[];
    minScore: number;
    remoteOnly?: boolean;
    minSalary?: number | null;
  }): JobScoringPreferences {
    return {
      roles: pref.roles,
      locations: pref.locations,
      requiredKeywords: pref.requiredKeywords,
      preferredKeywords: pref.preferredKeywords,
      excludeKeywords: pref.excludeKeywords,
      skills: pref.skills,
      minScore: pref.minScore,
      remoteOnly: pref.remoteOnly,
      minSalary: pref.minSalary ?? null,
    };
  }
}
