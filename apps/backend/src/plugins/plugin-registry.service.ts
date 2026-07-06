import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ParsedGoal } from '../agent/goal-understanding.service';
import { PluginMetadata, SitePlugin } from './plugin.interface';
import { SkillPluginAdapter } from './adapters/skill-plugin.adapter';
import { LinkedInSkill } from '../skills/job/linkedin.skill';
import { NaukriSkill } from '../skills/job/naukri.skill';
import { IndeedSkill } from '../skills/job/indeed.skill';
import { WellfoundSkill } from '../skills/job/wellfound.skill';
import { ZomatoSkill } from '../skills/food/zomato.skill';
import { SwiggySkill } from '../skills/food/swiggy.skill';
import { AmazonSkill } from '../skills/shopping/amazon.skill';
import { FlipkartSkill } from '../skills/shopping/flipkart.skill';

@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private plugins = new Map<string, SitePlugin>();

  async onModuleInit() {
    await this.registerDefaults();
  }

  /** Register a plugin at runtime (core or external npm package) */
  async register(plugin: SitePlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      this.logger.warn(`[PluginRegistry] Overwriting plugin: ${plugin.id}`);
    }
    if (plugin.initialize) {
      await plugin.initialize();
    }
    this.plugins.set(plugin.id, plugin);
    this.logger.log(`[PluginRegistry] Registered plugin: ${plugin.id} v${plugin.version} (${plugin.category})`);
  }

  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  get(pluginId: string): SitePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAll(): SitePlugin[] {
    return [...this.plugins.values()];
  }

  getByCategory(category: string): SitePlugin[] {
    return this.getAll().filter((p) => p.category === category);
  }

  /**
   * Returns plugins matching a goal within a category.
   * Prioritizes user preference memory and explicit preferred websites.
   */
  resolvePlugins(
    goal: ParsedGoal,
    category: string,
    parallel: boolean,
    preferredSites?: string[],
  ): SitePlugin[] {
    const categoryPlugins = this.getByCategory(category);
    if (categoryPlugins.length === 0) return [];

    // Collect all unique preferred domains or keywords
    const prefs = Array.from(
      new Set([
        ...(preferredSites || []),
        ...(goal.preferredWebsites || []),
      ].map((s) => s.toLowerCase())),
    );

    // Filter category plugins by capability (canHandle)
    const matched = categoryPlugins.filter((p) => p.canHandle(goal));

    // If specific preferences exist, prioritize and optionally narrow scope
    if (prefs.length > 0) {
      const pool = matched.length > 0 ? matched : categoryPlugins;
      const preferredMatched = pool.filter((p) => {
        const idLower = p.id.toLowerCase();
        return prefs.some(
          (pref) =>
            idLower.includes(pref) ||
            pref.includes(idLower.split('-')[0]) ||
            p.supportedDomains.some((d) => d.toLowerCase().includes(pref)),
        );
      });

      if (preferredMatched.length > 0) {
        const ranked = this.rankByPreference(preferredMatched, prefs);
        // Single learned preference → skip parallel fan-out (Swiggy-only routing)
        if (ranked.length === 1 || !parallel) {
          return [ranked[0]];
        }
        return ranked;
      }
    }

    if (!parallel) {
      return matched.length > 0 ? [matched[0]] : categoryPlugins.slice(0, 1);
    }

    const intent = goal.intent.toLowerCase();
    const siteKeywords = ['linkedin', 'indeed', 'naukri', 'wellfound', 'swiggy', 'zomato', 'amazon', 'flipkart'];
    if (siteKeywords.some((kw) => intent.includes(kw))) {
      return matched.length > 0 ? matched : categoryPlugins.slice(0, 1);
    }

    if ((goal.preferredWebsites?.length ?? 0) === 1) {
      return matched.length > 0 ? matched : categoryPlugins.slice(0, 1);
    }

    return categoryPlugins;
  }

  private rankByPreference(plugins: SitePlugin[], prefs: string[]): SitePlugin[] {
    const score = (p: SitePlugin) => {
      const idLower = p.id.toLowerCase();
      const idx = prefs.findIndex(
        (pref) =>
          idLower.includes(pref) ||
          pref.includes(idLower.split('-')[0]) ||
          p.supportedDomains.some((d) => d.toLowerCase().includes(pref)),
      );
      return idx >= 0 ? idx : 999;
    };
    return [...plugins].sort((a, b) => score(a) - score(b));
  }

  listMetadata(): PluginMetadata[] {
    return this.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      supportedDomains: p.supportedDomains,
      version: p.version,
    }));
  }

  private async registerDefaults() {
    const legacySkills = [
      new LinkedInSkill(),
      new NaukriSkill(),
      new IndeedSkill(),
      new WellfoundSkill(),
      new ZomatoSkill(),
      new SwiggySkill(),
      new AmazonSkill(),
      new FlipkartSkill(),
    ];

    for (const skill of legacySkills) {
      await this.register(new SkillPluginAdapter(skill));
    }

    this.logger.log(`[PluginRegistry] Bootstrapped ${this.plugins.size} default plugins`);
  }
}
