'use client';

import React, { useEffect, useState } from 'react';
import { useSocket } from '@/providers/SocketProvider';
import { AlertTriangle, Check, Clock, Shield, ShieldAlert, ShieldCheck, X } from 'lucide-react';

const RISK_CONFIG = {
  LOW: {
    icon: <ShieldCheck className="h-6 w-6" />,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    label: 'Low Risk',
  },
  MEDIUM: {
    icon: <Shield className="h-6 w-6" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    label: 'Medium Risk',
  },
  HIGH: {
    icon: <ShieldAlert className="h-6 w-6" />,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    label: 'High Risk',
  },
  CRITICAL: {
    icon: <AlertTriangle className="h-6 w-6" />,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    label: 'Critical Risk',
  },
} as const;

export default function ApprovalModal() {
  const { pendingApproval, sendApprovalResponse } = useSocket();
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!pendingApproval) return;

    const expiresAt = new Date(pendingApproval.expiresAt).getTime();
    const tick = () => {
      setTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pendingApproval]);

  if (!pendingApproval) return null;

  const riskKey = (pendingApproval.riskLevel?.toUpperCase() ||
    'MEDIUM') as keyof typeof RISK_CONFIG;
  const risk = RISK_CONFIG[riskKey] ?? RISK_CONFIG.MEDIUM;
  const details = pendingApproval.actionDetails;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`mx-4 w-full max-w-lg overflow-hidden rounded-2xl border bg-gray-900 shadow-2xl ${risk.border}`}
      >
        <div className={`border-b px-6 py-4 ${risk.bg} ${risk.border}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={risk.color}>{risk.icon}</span>
              <div>
                <h3 className="font-semibold text-white">Approval Required</h3>
                <p className={`text-sm ${risk.color}`}>{risk.label} Action</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="h-4 w-4" />
              <span
                className={`font-mono text-sm ${timeLeft < 30 ? 'text-red-400' : ''}`}
              >
                {Math.floor(timeLeft / 60)}:
                {(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-gray-200">
            {details?.description || 'The agent wants to perform a sensitive action.'}
          </p>

          <div className="space-y-2 rounded-lg bg-gray-800 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="font-medium">Action:</span>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono uppercase text-blue-300">
                {details?.action}
              </span>
            </div>
            {details?.target && (
              <div className="flex items-start gap-2 text-xs text-gray-400">
                <span className="flex-shrink-0 font-medium">Target:</span>
                <code className="break-all rounded bg-gray-700 px-2 py-0.5 text-gray-300">
                  {details.target}
                </code>
              </div>
            )}
            <div className="text-xs text-gray-400">
              <span className="font-medium">Step:</span>{' '}
              <span className="text-gray-300">#{pendingApproval.stepIndex}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 pt-0">
          <button
            type="button"
            onClick={() => sendApprovalResponse(pendingApproval.id, 'DENIED')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
          >
            <X className="h-4 w-4" />
            Deny
          </button>
          <button
            type="button"
            onClick={() => sendApprovalResponse(pendingApproval.id, 'APPROVED')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${
              riskKey === 'CRITICAL'
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <Check className="h-4 w-4" />
            {riskKey === 'CRITICAL' ? 'Approve (Risky)' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
