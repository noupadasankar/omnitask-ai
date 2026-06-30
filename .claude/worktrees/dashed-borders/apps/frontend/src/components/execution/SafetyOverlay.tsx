'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Lock, Puzzle, Key, CreditCard, AlertTriangle,
  Play, X, ChevronDown, ChevronUp, Clock, Monitor,
  Hand, ExternalLink, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SafetyOverlayProps {
  phase: string;
  pendingApproval: {
    id: string;
    stepIndex: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    actionDetails: {
      action: string;
      target?: string;
      value?: string;
      description: string;
    };
    expiresAt: string;
  } | null;
  currentScreenshot: { base64: string; width: number; height: number } | null;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  onResume: () => void;
  onCancel: () => void;
}

type SafetyType = 'login' | 'captcha' | 'otp' | 'payment' | 'general';

function detectSafetyType(phase: string, approval: SafetyOverlayProps['pendingApproval']): SafetyType {
  if (!approval) {
    if (phase === 'waiting_otp') return 'otp';
    return 'general';
  }

  const action = (approval.actionDetails?.action || '').toLowerCase();
  const desc = (approval.actionDetails?.description || '').toLowerCase();
  const combined = `${action} ${desc}`;

  if (combined.includes('otp') || combined.includes('verification code') || phase === 'waiting_otp') return 'otp';
  if (combined.includes('captcha') || combined.includes('recaptcha') || combined.includes('turnstile') || combined.includes('hcaptcha')) return 'captcha';
  if (combined.includes('login') || combined.includes('sign in') || combined.includes('authenticate')) return 'login';
  if (combined.includes('payment') || combined.includes('credit card') || combined.includes('billing') || combined.includes('checkout') || combined.includes('cvv')) return 'payment';
  return 'general';
}

const SAFETY_CONFIG: Record<SafetyType, {
  icon: React.ComponentType<any>;
  emoji: string;
  title: string;
  description: string;
  color: string;
  borderColor: string;
  bgColor: string;
  guide: string[];
}> = {
  login: {
    icon: Lock,
    emoji: '🔐',
    title: 'LOGIN AUTHENTICATION REQUIRED',
    description: 'The automation engine has detected a login page. For security, credential entry has been blocked. Please authenticate manually in the Chrome browser window.',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/5',
    guide: [
      'Switch to the Chrome browser window on your taskbar',
      'Enter your username and password manually',
      'Complete any 2FA/MFA challenges if prompted',
      'Return here and click "Resume Execution" when logged in',
    ],
  },
  captcha: {
    icon: Puzzle,
    emoji: '🧩',
    title: 'CAPTCHA VERIFICATION REQUIRED',
    description: 'A CAPTCHA challenge has been detected (reCAPTCHA, hCaptcha, or Cloudflare Turnstile). The automation engine cannot solve this automatically.',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-500/40',
    bgColor: 'bg-cyan-500/5',
    guide: [
      'Switch to the Chrome browser window',
      'Complete the CAPTCHA verification challenge',
      'Wait for the page to update after solving',
      'Return here and click "Resume Execution"',
    ],
  },
  otp: {
    icon: Key,
    emoji: '🔑',
    title: 'OTP / VERIFICATION CODE BLOCKED',
    description: 'A one-time password or verification code input has been detected. For security, the agent will not type sensitive verification codes.',
    color: 'text-orange-400',
    borderColor: 'border-orange-500/40',
    bgColor: 'bg-orange-500/5',
    guide: [
      'Check your phone/email for the verification code',
      'Switch to the Chrome browser window',
      'Enter the OTP/code manually into the field',
      'Return here and click "Resume Execution"',
    ],
  },
  payment: {
    icon: CreditCard,
    emoji: '💳',
    title: 'PAYMENT DETAILS BLOCKED',
    description: 'A payment form has been detected (credit card, CVV, or billing fields). The agent will never enter financial information automatically.',
    color: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-500/5',
    guide: [
      'Switch to the Chrome browser window',
      'Review the payment amount and details carefully',
      'Enter your payment information manually',
      'Complete the transaction at your discretion',
      'Return here and click "Resume Execution" when done',
    ],
  },
  general: {
    icon: Shield,
    emoji: '🛡️',
    title: 'EXECUTION PAUSED — APPROVAL REQUIRED',
    description: 'The automation engine has paused execution and requires your manual intervention before proceeding.',
    color: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-500/5',
    guide: [
      'Review the pending action details below',
      'If manual interaction is needed, switch to Chrome',
      'Click "Resume" to continue or "Abort" to terminate',
    ],
  },
};

const RISK_STYLES: Record<string, { border: string; glow: string; badge: string }> = {
  LOW: { border: 'border-white/10', glow: '', badge: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
  MEDIUM: { border: 'border-yellow-500/30', glow: 'neon-glow-amber', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  HIGH: { border: 'border-orange-500/40', glow: 'neon-glow-amber', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  CRITICAL: { border: 'border-red-500/50', glow: 'neon-glow-red-intense', badge: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

export function SafetyOverlay({
  phase,
  pendingApproval,
  currentScreenshot,
  onApprove,
  onDeny,
  onResume,
  onCancel,
}: SafetyOverlayProps) {
  const [showGuide, setShowGuide] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [isShaking, setIsShaking] = useState(false);

  const shouldShow = phase === 'waiting_approval' || phase === 'waiting_otp' || (phase === 'paused' && pendingApproval !== null);

  // Countdown timer
  useEffect(() => {
    if (!pendingApproval?.expiresAt) {
      setTimeLeft(300);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((new Date(pendingApproval.expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      setIsShaking(remaining < 30 && remaining > 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pendingApproval]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!shouldShow) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && pendingApproval) {
        e.preventDefault();
        onApprove(pendingApproval.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (pendingApproval) {
          onDeny(pendingApproval.id);
        } else {
          onCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [shouldShow, pendingApproval, onApprove, onDeny, onCancel]);

  if (!shouldShow) return null;

  const safetyType = detectSafetyType(phase, pendingApproval);
  const config = SAFETY_CONFIG[safetyType];
  const riskLevel = pendingApproval?.riskLevel || 'MEDIUM';
  const riskStyle = RISK_STYLES[riskLevel] || RISK_STYLES.MEDIUM;
  const IconComponent = config.icon;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="safety-overlay"
      >
        {/* Blurred screenshot background */}
        {currentScreenshot && (
          <div
            className="safety-overlay-bg"
            style={{
              backgroundImage: `url(data:image/jpeg;base64,${currentScreenshot.base64})`,
            }}
          />
        )}

        {/* Floating particles */}
        <div className="particle-field">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className={`particle particle-${i}`} />
          ))}
        </div>

        {/* Center safety card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            "safety-card hazard-stripe hazard-stripe-bottom",
            riskStyle.border,
            riskStyle.glow,
            isShaking && "shake-urgent"
          )}
          style={{ borderWidth: '2px', borderStyle: 'solid' }}
        >
          {/* Header with icon and pulse rings */}
          <div className="flex flex-col items-center text-center mb-6 pt-4">
            {/* Animated shield with pulse rings */}
            <div className={cn("relative mb-4 pulse-ring-triple rounded-2xl", config.color)}>
              <div className={cn(
                "h-16 w-16 rounded-2xl flex items-center justify-center border-2",
                config.borderColor, config.bgColor
              )}>
                <IconComponent className="h-8 w-8" />
              </div>
            </div>

            {/* Risk badge */}
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-mono font-bold uppercase tracking-widest mb-3",
              riskStyle.badge
            )}>
              <AlertTriangle className="h-3 w-3" />
              {riskLevel} RISK
            </div>

            {/* Title */}
            <h2 className="text-base font-black text-white tracking-wide mb-2">
              {config.emoji} {config.title}
            </h2>

            {/* Description */}
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              {config.description}
            </p>
          </div>

          {/* Action details code block */}
          {pendingApproval?.actionDetails && (
            <div className="rounded-xl border border-white/5 bg-black/40 p-3 mb-4 font-mono text-[10px] space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-zinc-600">ACTION:</span>
                <span className="text-red-400 font-bold">{pendingApproval.actionDetails.action}</span>
              </div>
              {pendingApproval.actionDetails.target && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">TARGET:</span>
                  <span className="text-zinc-300 truncate">{pendingApproval.actionDetails.target}</span>
                </div>
              )}
              {pendingApproval.actionDetails.value && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600">VALUE:</span>
                  <span className="text-zinc-300">{'•'.repeat(Math.min(pendingApproval.actionDetails.value.length, 12))}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-zinc-600">STEP:</span>
                <span className="text-zinc-300">#{pendingApproval.stepIndex + 1}</span>
              </div>
            </div>
          )}

          {/* Countdown timer */}
          {pendingApproval && (
            <div className={cn(
              "flex items-center justify-center gap-2 py-2 mb-4 rounded-xl border",
              timeLeft < 30 ? "border-red-500/30 bg-red-500/5" : "border-white/5 bg-white/[0.01]"
            )}>
              <Clock className={cn("h-3.5 w-3.5", timeLeft < 30 ? "text-red-500 animate-pulse" : "text-zinc-500")} />
              <span className={cn(
                "text-xs font-mono font-bold tabular-nums",
                timeLeft < 30 ? "text-red-400 neon-text-red" : "text-zinc-400"
              )}>
                AUTO-DENY IN {timeFormatted}
              </span>
            </div>
          )}

          {/* Manual Takeover Guide */}
          <div className="mb-5">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest hover:bg-white/[0.03] hover:text-white transition-all"
            >
              <div className="flex items-center gap-2">
                <Hand className="h-3.5 w-3.5" />
                MANUAL TAKEOVER GUIDE
              </div>
              {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            <AnimatePresence>
              {showGuide && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-2 px-1">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-400">
                      <Monitor className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-semibold">The Chrome browser window is fully interactive — you can click, type, and navigate freely.</span>
                    </div>
                    {config.guide.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 px-3 text-[10px] text-zinc-400">
                        <span className="h-4 w-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-[8px] font-bold text-zinc-500 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {/* Resume / Approve */}
            <button
              onClick={() => {
                if (pendingApproval) {
                  onApprove(pendingApproval.id);
                } else {
                  onResume();
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-red-500 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] active:scale-[0.98]"
            >
              <Play className="h-4 w-4" />
              RESUME EXECUTION
              <span className="text-[9px] font-mono opacity-60 ml-1">[ENTER]</span>
            </button>

            {/* Abort */}
            <button
              onClick={() => {
                if (pendingApproval) {
                  onDeny(pendingApproval.id);
                } else {
                  onCancel();
                }
              }}
              className="flex items-center justify-center gap-2 h-12 px-5 rounded-xl border-2 border-red-500/20 bg-red-500/5 text-sm font-bold text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/30 active:scale-[0.98]"
            >
              <X className="h-4 w-4" />
              ABORT
              <span className="text-[9px] font-mono opacity-60 ml-1">[ESC]</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
