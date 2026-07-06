'use client';

import { useState } from 'react';
import {
  CreditCard,
  Zap,
  HardDrive,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  description: string;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tasks: 50,
    storage: 100,
    features: ['50 tasks/month', '100MB storage', 'Basic support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    tasks: 1000,
    storage: 5000,
    features: ['Unlimited tasks', '5GB storage', 'Priority support', 'Advanced analytics', 'Team members'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    tasks: 10000,
    storage: 50000,
    features: ['Everything in Pro', '50GB storage', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
  },
];

const MOCK_INVOICES: Invoice[] = [
  { id: 'inv_001', date: '2026-06-01', amount: 29, status: 'PAID', description: 'Pro Plan - June 2026' },
  { id: 'inv_002', date: '2026-05-01', amount: 29, status: 'PAID', description: 'Pro Plan - May 2026' },
  { id: 'inv_003', date: '2026-04-01', amount: 29, status: 'PAID', description: 'Pro Plan - April 2026' },
  { id: 'inv_004', date: '2026-03-01', amount: 0, status: 'PAID', description: 'Free Plan - March 2026' },
];

export default function BillingSettingsPage() {
  const [currentPlan, setCurrentPlan] = useState('pro');
  const [changing, setChanging] = useState<string | null>(null);
  const [tasksUsed] = useState(342);
  const [storageUsed] = useState(1.2);

  const plan = PLANS.find((p) => p.id === currentPlan)!;
  const tasksPercent = (tasksUsed / plan.tasks) * 100;
  const storagePercent = (storageUsed / (plan.storage / 1000)) * 100;

  const handleChangePlan = async (planId: string) => {
    setChanging(planId);
    await new Promise((r) => setTimeout(r, 1000));
    setCurrentPlan(planId);
    setChanging(null);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Billing & Subscription</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your plan, payment methods, and billing history.
        </p>
      </div>

      {/* Current Plan */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Current Plan</h2>
          </div>
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
            {plan.name}
          </span>
        </div>
        <p className="text-3xl font-black text-white">${plan.price}<span className="text-sm font-medium text-zinc-500">/month</span></p>

        {/* Usage bars */}
        <div className="mt-5 space-y-4">
          <UsageBar icon={Zap} label="Tasks Used" used={tasksUsed} total={plan.tasks} unit="" percent={tasksPercent} color="bg-red-500" />
          <UsageBar icon={HardDrive} label="Storage Used" used={storageUsed} total={plan.storage / 1000} unit="GB" percent={storagePercent} color="bg-blue-500" />
        </div>

        {/* Features */}
        <div className="mt-5 space-y-2">
          {plan.features.map((f) => (
            <div key={f} className="flex items-center gap-2 text-xs text-zinc-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Plan selector */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <h2 className="mb-4 text-sm font-semibold text-white">Change Plan</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => {
            const isCurrent = currentPlan === p.id;
            const isUpgrade = !isCurrent && (p.id === 'pro' || (currentPlan === 'free' && p.id === 'pro'));
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-2xl border p-4 transition-all',
                  isCurrent
                    ? 'border-red-500/30 bg-red-500/[0.03]'
                    : 'border-white/[0.07] hover:border-white/15',
                )}
              >
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{p.name}</p>
                <p className="mt-1 text-2xl font-bold text-white">${p.price}<span className="text-xs font-medium text-zinc-500">/mo</span></p>
                {isCurrent ? (
                  <span className="mt-3 flex h-8 w-full items-center justify-center rounded-xl bg-red-500/10 text-[11px] font-semibold text-red-400">
                    Current Plan
                  </span>
                ) : (
                  <button
                    onClick={() => handleChangePlan(p.id)}
                    disabled={changing === p.id}
                    className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] text-[11px] font-semibold text-zinc-300 transition-all hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    {changing === p.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isUpgrade ? (
                      <ArrowUp className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <ArrowDown className="h-3 w-3 text-red-400" />
                    )}
                    {isUpgrade ? 'Upgrade' : 'Downgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center gap-2.5">
          <CreditCard className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Payment Method</h2>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
              <CreditCard className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Visa ending in 4242</p>
              <p className="text-[10px] text-zinc-500">Expires 12/28</p>
            </div>
          </div>
          <button className="text-xs text-zinc-500 hover:text-white transition-colors">Update</button>
        </div>
        <p className="mt-3 text-[10px] text-zinc-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Stripe is not connected. Payment methods are for display only.
        </p>
      </div>

      {/* Invoice History */}
      <div className="rounded-[24px] border border-white/[0.07] bg-black/30 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Download className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Invoice History</h2>
          </div>
          <span className="text-[10px] text-zinc-600">{MOCK_INVOICES.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.05] text-zinc-600">
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Description</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id} className="border-b border-white/[0.03]">
                  <td className="py-3 pr-4 text-zinc-400">{new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td className="py-3 pr-4 text-white">{inv.description}</td>
                  <td className="py-3 pr-4 font-semibold text-white">${inv.amount.toFixed(2)}</td>
                  <td className="py-3">
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      inv.status === 'PAID' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
                      inv.status === 'PENDING' ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400' :
                      'border-red-500/20 bg-red-500/10 text-red-400',
                    )}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ icon: Icon, label, used, total, unit, percent, color }: {
  icon: any; label: string; used: number; total: number; unit: string; percent: number; color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <span className="text-zinc-500">{used}{unit} / {total}{unit}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
