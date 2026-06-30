export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type UserTier = 'free' | 'basic' | 'premium' | 'enterprise' | 'admin';

export interface RateLimitTier {
  windowMs: number;
  maxRequests: number;
  name: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  domain: 'gdpr' | 'pci' | 'soc2' | 'hipaa' | 'custom';
  severity: 'warning' | 'block' | 'log';
  evaluator: string; // reference to evaluator function name
  config: Record<string, unknown>;
}

export interface PolicyResult {
  allowed: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reason?: string;
  violations?: string[];
  complianceChecks?: { ruleId: string; passed: boolean; detail: string }[];
}

export interface UserPolicyContext {
  userId: string;
  role: string;
  tier: UserTier;
  ip: string;
  userAgent: string;
}

export const RATE_LIMIT_TIERS: Record<UserTier, RateLimitTier> = {
  free: { windowMs: 60000, maxRequests: 30, name: 'Free' },
  basic: { windowMs: 60000, maxRequests: 60, name: 'Basic' },
  premium: { windowMs: 60000, maxRequests: 200, name: 'Premium' },
  enterprise: { windowMs: 60000, maxRequests: 500, name: 'Enterprise' },
  admin: { windowMs: 60000, maxRequests: 1000, name: 'Admin' },
};

export const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: 'gdpr-data-export',
    name: 'GDPR Data Export',
    description: 'User data export requests must be fulfilled within 30 days',
    domain: 'gdpr',
    severity: 'warning',
    evaluator: 'checkGdprDataExport',
    config: { maxDays: 30 },
  },
  {
    id: 'pci-payment-data',
    name: 'PCI Payment Data',
    description: 'Credit card data must never be stored in plaintext',
    domain: 'pci',
    severity: 'block',
    evaluator: 'checkPciPaymentData',
    config: {},
  },
  {
    id: 'soc2-audit-log',
    name: 'SOC2 Audit Trail',
    description: 'All access to production data must be logged',
    domain: 'soc2',
    severity: 'warning',
    evaluator: 'checkSoc2AuditLog',
    config: {},
  },
];
