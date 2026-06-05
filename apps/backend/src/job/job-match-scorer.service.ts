import { Injectable, Logger } from '@nestjs/common';

export interface JobPosting {
  /** Source portal, e.g. 'linkedin' | 'naukri' | 'indeed' | 'wellfound'. */
  portal: string;
  externalJobId: string;
  title: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  /** Free-form tags/skills scraped from the listing, if any. */
  tags?: string[];
  salary?: number | null;
  remote?: boolean;
}

export interface JobScoringPreferences {
  roles: string[];
  locations: string[];
  requiredKeywords: string[];
  preferredKeywords: string[];
  excludeKeywords: string[];
  skills: string[];
  minScore: number;
  remoteOnly?: boolean;
  minSalary?: number | null;
}

export interface JobMatchResult {
  score: number;
  qualifies: boolean;
  reasons: string[];
  breakdown: Record<string, number>;
}

/**
 * Rule-based job match scorer (ported from the Autonomous Job Application Agent
 * spec). Deterministic and explainable — no LLM call — so scoring is fast,
 * auditable, and cheap to run across many listings.
 *
 *   Role match         +30   (flexible keyword overlap)
 *   Location match     +20
 *   Required keywords  +25   (all-or-proportional)
 *   Preferred keywords +15
 *   Skills match       +10
 *   Exclude keywords   -50   (hard penalty)
 *
 * Qualifies when score >= preferences.minScore (default 60).
 */
@Injectable()
export class JobMatchScorerService {
  private readonly logger = new Logger(JobMatchScorerService.name);

  private readonly WEIGHTS = {
    role: 30,
    location: 20,
    required: 25,
    preferred: 15,
    skills: 10,
    excludePenalty: -50,
  };

  score(job: JobPosting, prefs: JobScoringPreferences): JobMatchResult {
    const haystack = this.haystack(job);
    const reasons: string[] = [];
    const breakdown: Record<string, number> = {};
    let score = 0;

    // ── Exclusions first — a single hit applies the hard penalty. ──
    const excludeHit = this.firstMatch(haystack, prefs.excludeKeywords);
    if (excludeHit) {
      breakdown.exclude = this.WEIGHTS.excludePenalty;
      score += this.WEIGHTS.excludePenalty;
      reasons.push(`Excluded keyword present: "${excludeHit}" (${this.WEIGHTS.excludePenalty})`);
    }

    // ── Role (flexible: any preferred role keyword overlaps the title). ──
    const roleHit = this.firstMatch(`${job.title} ${haystack}`, prefs.roles);
    if (roleHit) {
      breakdown.role = this.WEIGHTS.role;
      score += this.WEIGHTS.role;
      reasons.push(`Role match: "${roleHit}" (+${this.WEIGHTS.role})`);
    } else if (prefs.roles.length) {
      reasons.push('No preferred role keyword matched');
    }

    // ── Location (skip if remoteOnly satisfied). ──
    if (prefs.remoteOnly && (job.remote || /\bremote\b/.test(haystack))) {
      breakdown.location = this.WEIGHTS.location;
      score += this.WEIGHTS.location;
      reasons.push(`Remote role (+${this.WEIGHTS.location})`);
    } else {
      const locHit = this.firstMatch(job.location || haystack, prefs.locations);
      if (locHit) {
        breakdown.location = this.WEIGHTS.location;
        score += this.WEIGHTS.location;
        reasons.push(`Location match: "${locHit}" (+${this.WEIGHTS.location})`);
      }
    }

    // ── Required keywords (proportional to coverage). ──
    if (prefs.requiredKeywords.length) {
      const matched = prefs.requiredKeywords.filter((k) => this.contains(haystack, k));
      const pts = Math.round((matched.length / prefs.requiredKeywords.length) * this.WEIGHTS.required);
      if (pts > 0) {
        breakdown.required = pts;
        score += pts;
        reasons.push(`Required keywords ${matched.length}/${prefs.requiredKeywords.length} (+${pts})`);
      }
    }

    // ── Preferred keywords (proportional). ──
    if (prefs.preferredKeywords.length) {
      const matched = prefs.preferredKeywords.filter((k) => this.contains(haystack, k));
      const pts = Math.round((matched.length / prefs.preferredKeywords.length) * this.WEIGHTS.preferred);
      if (pts > 0) {
        breakdown.preferred = pts;
        score += pts;
        reasons.push(`Preferred keywords ${matched.length}/${prefs.preferredKeywords.length} (+${pts})`);
      }
    }

    // ── Skills (proportional). ──
    if (prefs.skills.length) {
      const matched = prefs.skills.filter((k) => this.contains(haystack, k));
      const pts = Math.round((matched.length / prefs.skills.length) * this.WEIGHTS.skills);
      if (pts > 0) {
        breakdown.skills = pts;
        score += pts;
        reasons.push(`Skills ${matched.length}/${prefs.skills.length} (+${pts})`);
      }
    }

    // ── Salary floor — disqualifies if a salary is known and below the floor. ──
    if (prefs.minSalary && typeof job.salary === 'number' && job.salary < prefs.minSalary) {
      breakdown.salary = -999;
      reasons.push(`Salary ${job.salary} below floor ${prefs.minSalary} — disqualified`);
      return { score, qualifies: false, reasons, breakdown };
    }

    const qualifies = score >= prefs.minScore && !excludeHit;
    return { score, qualifies, reasons, breakdown };
  }

  private haystack(job: JobPosting): string {
    return [job.title, job.company, job.location, job.description, ...(job.tags || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private contains(haystack: string, keyword: string): boolean {
    const k = keyword.trim().toLowerCase();
    return k.length > 0 && haystack.includes(k);
  }

  private firstMatch(text: string, keywords: string[]): string | null {
    const t = (text || '').toLowerCase();
    for (const raw of keywords) {
      const k = raw.trim().toLowerCase();
      if (k && t.includes(k)) return raw;
    }
    return null;
  }
}
