import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemoryStoreService } from '../../agent/memory-store.service';

export interface UserDomainPreferences {
  preferredJobSites: string[];
  preferredFoodApps: string[];
  preferredShoppingSites: string[];
  preferredTravelSites: string[];
  preferredEmailServices: string[];
  preferredMediaServices: string[];
}

export interface SiteSuccessStats {
  successCount: number;
  totalAttempts: number;
}

const CATEGORY_PREF_KEYS: Record<string, keyof UserDomainPreferences> = {
  job: 'preferredJobSites',
  food: 'preferredFoodApps',
  shopping: 'preferredShoppingSites',
  travel: 'preferredTravelSites',
  email: 'preferredEmailServices',
  media: 'preferredMediaServices',
};

/** Human-readable label from plugin id, e.g. linkedin-apply → LinkedIn */
export function formatPluginLabel(pluginId: string): string {
  const base = pluginId.split('-')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

@Injectable()
export class PreferenceMemoryService {
  private readonly logger = new Logger(PreferenceMemoryService.name);

  constructor(
    private prisma: PrismaService,
    private memoryStore: MemoryStoreService,
  ) {}

  /**
   * Retrieves the domain preferences card for a user.
   */
  async getPreferences(userId: string): Promise<UserDomainPreferences> {
    const memory = await this.prisma.agentMemory.findUnique({
      where: { id: `preferences_card_${userId}` },
    });

    const defaultPrefs: UserDomainPreferences = {
      preferredJobSites: [],
      preferredFoodApps: [],
      preferredShoppingSites: [],
      preferredTravelSites: [],
      preferredEmailServices: [],
      preferredMediaServices: [],
    };

    if (!memory) {
      return defaultPrefs;
    }

    try {
      return {
        ...defaultPrefs,
        ...JSON.parse(memory.content),
      };
    } catch {
      return defaultPrefs;
    }
  }

  /**
   * Persists the domain preferences card for a user.
   */
  async savePreferences(userId: string, prefs: UserDomainPreferences): Promise<void> {
    await this.memoryStore.upsert(
      `preferences_card_${userId}`,
      userId,
      'SEMANTIC',
      'preferences:card',
      JSON.stringify(prefs),
      0.9,
    );
  }

  /** Category-specific preferred plugin ids (learned or explicit). */
  getPreferredForCategory(
    prefs: UserDomainPreferences,
    category: string,
  ): string[] {
    const key = CATEGORY_PREF_KEYS[category.toLowerCase()];
    if (!key) return [];
    return prefs[key] || [];
  }

  /**
   * Sort plugins so learned/explicit preferences appear first.
   */
  rankPluginIds(pluginIds: string[], preferredIds: string[]): string[] {
    if (preferredIds.length === 0) return pluginIds;
    const prefSet = new Set(preferredIds.map((p) => p.toLowerCase()));
    const score = (id: string) => {
      const lower = id.toLowerCase();
      const idx = preferredIds.findIndex(
        (p) => lower.includes(p.toLowerCase()) || p.toLowerCase().includes(lower.split('-')[0]),
      );
      return idx >= 0 ? idx : 999;
    };
    return [...pluginIds].sort((a, b) => score(a) - score(b));
  }

  /**
   * Implicitly learns user preferences based on successful action plugin usages.
   */
  async autoLearn(userId: string, category: string, pluginId: string): Promise<void> {
    this.logger.log(`[PreferenceMemory] Tracking successful usage of ${pluginId} in category ${category} for learning`);

    // Get current usage stats
    const statsId = `stats_${userId}_${category}`;
    const memory = await this.prisma.agentMemory.findUnique({
      where: { id: statsId },
    });

    let stats: Record<string, SiteSuccessStats> = {};
    if (memory) {
      try {
        stats = JSON.parse(memory.content);
      } catch {
        stats = {};
      }
    }

    if (!stats[pluginId]) {
      stats[pluginId] = { successCount: 0, totalAttempts: 0 };
    }

    // Increment success count
    stats[pluginId].successCount += 1;
    stats[pluginId].totalAttempts += 1;

    // Upsert stats
    await this.memoryStore.upsert(
      statsId,
      userId,
      'SEMANTIC',
      `preferences:stats:${category}`,
      JSON.stringify(stats),
      0.5,
    );

    // Check if we should update preferences
    const totalSuccessfulRuns = Object.values(stats).reduce((sum, item) => sum + item.successCount, 0);
    const targetStats = stats[pluginId];

    // Epistemic promotion criteria:
    // 1. Minimum 3 successful runs on this specific plugin/site.
    // 2. This site accounts for >= 75% of successful outcomes in this category.
    if (targetStats.successCount >= 3 && targetStats.successCount / totalSuccessfulRuns >= 0.75) {
      const prefs = await this.getPreferences(userId);
      let updated = false;

      switch (category.toLowerCase()) {
        case 'job':
          if (!prefs.preferredJobSites.includes(pluginId)) {
            prefs.preferredJobSites = [pluginId];
            updated = true;
          }
          break;
        case 'food':
          if (!prefs.preferredFoodApps.includes(pluginId)) {
            prefs.preferredFoodApps = [pluginId];
            updated = true;
          }
          break;
        case 'shopping':
          if (!prefs.preferredShoppingSites.includes(pluginId)) {
            prefs.preferredShoppingSites = [pluginId];
            updated = true;
          }
          break;
        case 'travel':
          if (!prefs.preferredTravelSites.includes(pluginId)) {
            prefs.preferredTravelSites = [pluginId];
            updated = true;
          }
          break;
      }

      if (updated) {
        this.logger.log(`[PreferenceMemory] Automatically promoted ${pluginId} as preferred site/app for category ${category}`);
        await this.savePreferences(userId, prefs);
      }
    }
  }
}
