'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, FileText, CheckCircle2, ChevronRight, ChevronLeft,
  Briefcase, MapPin, SlidersHorizontal, Rocket, Loader2, AlertTriangle,
  Trash2, Plus, Globe, Info, User, Mail, Phone, Eye, EyeOff, Lock,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadResume, launchJobAgent } from '@/services/job.service';
import {
  loadJobProfile, saveJobProfile,
  hasCompleteProfile, hasCredentialsFor,
  type UserProfile, type PortalCredential,
} from '@/lib/job-profile';

/* ─── Types ──────────────────────────────────────────────────────────────────── */

export interface JobWizardResult {
  sessionId: string;
  taskId: string;
  dispatched: boolean;
}

interface Props {
  open: boolean;
  taskText: string;
  onClose: () => void;
  onLaunched: (result: JobWizardResult) => void;
}

/* ─── Portal definitions ─────────────────────────────────────────────────────── */

const PORTALS = [
  {
    id: 'linkedin', name: 'LinkedIn', desc: 'Easy Apply on LinkedIn',
    color: 'text-[#0A66C2]', bg: 'bg-[#0A66C2]/10', border: 'border-[#0A66C2]/20', activeBorder: 'border-[#0A66C2]/60',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[#0A66C2]">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: 'naukri', name: 'Naukri', desc: "India's largest job portal",
    color: 'text-[#FF5C5C]', bg: 'bg-[#FF5C5C]/10', border: 'border-[#FF5C5C]/20', activeBorder: 'border-[#FF5C5C]/60',
    icon: <div className="h-5 w-5 flex items-center justify-center rounded text-[10px] font-black text-[#FF5C5C]">N</div>,
  },
  {
    id: 'instahyre', name: 'Instahyre', desc: 'AI-powered hiring platform',
    color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', activeBorder: 'border-purple-500/60',
    icon: <div className="h-5 w-5 flex items-center justify-center rounded text-[10px] font-black text-purple-400">I</div>,
  },
  {
    id: 'hirist', name: 'Hirist', desc: 'Tech-focused job platform',
    color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', activeBorder: 'border-teal-500/60',
    icon: <div className="h-5 w-5 flex items-center justify-center rounded text-[10px] font-black text-teal-400">H</div>,
  },
  {
    id: 'cutshort', name: 'Cutshort', desc: 'Referral-based job discovery',
    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', activeBorder: 'border-orange-500/60',
    icon: <div className="h-5 w-5 flex items-center justify-center rounded text-[10px] font-black text-orange-400">C</div>,
  },
];

function parseJobTask(task: string) {
  const lower = task.toLowerCase();
  const portals = PORTALS.filter((p) => lower.includes(p.id)).map((p) => p.id);
  const roleMatch = task.match(
    /(?:apply(?:ing)?\s+(?:to|for)|find|search(?:ing)?\s+for|looking\s+for|get\s+(?:a\s+)?)\s+([\w\s,&+./-]+?)(?:\s+(?:jobs?|positions?|roles?|openings?|careers?|vacancies))/i,
  );
  const roles = roleMatch
    ? roleMatch[1].split(/,|\band\b/).map((r) => r.trim()).filter((r) => r.length > 1 && r.length < 60)
    : [];
  const locationMatch = task.match(/\b(?:in|at|near|around)\s+([A-Za-z][a-zA-Z\s,]{2,40}?)(?:\s*$|[.,]|\s+(?:and|or|on|via)\s)/i);
  const locationRaw = locationMatch ? locationMatch[1].trim() : '';
  const locations = locationRaw
    ? locationRaw.split(',').map((l) => l.trim()).filter((l) => l.length > 1 && !PORTALS.some((p) => l.toLowerCase().includes(p.id)))
    : [];
  return { portals, roles, locations };
}

/* ─── Step dots ──────────────────────────────────────────────────────────────── */

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i + 1 < current ? 'h-2 w-2 bg-emerald-500' :
            i + 1 === current ? 'h-2 w-5 bg-red-500' :
            'h-2 w-2 bg-white/10',
          )}
        />
      ))}
    </div>
  );
}

const STEP_LABELS = ['Profile', 'Resume', 'Platforms', 'Credentials', 'Preferences', 'Review'];

/* ─── Main component ─────────────────────────────────────────────────────────── */

export function JobWizardModal({ open, taskText, onClose, onLaunched }: Props) {
  const parsed = parseJobTask(taskText);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Step 1 — Profile
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '', phone: '' });

  // Step 2 — Resume
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [resumeName, setResumeName] = useState<string | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — Platforms
  const [selectedPortals, setSelectedPortals] = useState<string[]>(
    parsed.portals.length > 0 ? parsed.portals : ['linkedin'],
  );

  // Step 4 — Credentials
  const [credentials, setCredentials] = useState<Record<string, PortalCredential>>({});

  // Step 5 — Preferences
  const [roles, setRoles] = useState<string[]>(parsed.roles);
  const [roleInput, setRoleInput] = useState('');
  const [locations, setLocations] = useState<string[]>(parsed.locations);
  const [locationInput, setLocationInput] = useState('');
  const [maxApplications, setMaxApplications] = useState(10);
  // Default to LIVE + fully autonomous submit (user-chosen behavior): fill and
  // submit every matching job. Toggle Dry Run / "approve each" below to change.
  const [dryRun, setDryRun] = useState(false);
  // Only meaningful when live (dryRun=false): true → submit every job
  // automatically, false → pause for approval before each submit. Chosen here,
  // per launch — never read from .env.
  const [autoApprove, setAutoApprove] = useState(true);

  // Step 6 — Launch
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Load from localStorage on open
  useEffect(() => {
    if (!open) return;
    const saved = loadJobProfile();
    setProfile(saved.profile);
    setCredentials(saved.credentials);
    if (saved.resumeUploaded) {
      setUploaded(true);
      setResumeName(saved.resumeName);
    }
    const p = parseJobTask(taskText);
    setSelectedPortals(p.portals.length > 0 ? p.portals : ['linkedin']);
    setRoles(p.roles.length > 0 ? p.roles : []);
    setLocations(p.locations.length > 0 ? p.locations : []);
    setStep(1);
    setResumeFile(null);
    setUploadError(null);
    setLaunchError(null);
    setDryRun(false);       // fresh launch defaults to live…
    setAutoApprove(true);   // …and fully autonomous submit
  }, [open, taskText]);

  /* ─── Resume ──────────────────────────────────────────────────────── */

  const handleFile = useCallback(async (file: File) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) { setUploadError(`Unsupported format. Allowed: ${allowed.join(', ')}`); return; }
    setResumeFile(file);
    setUploading(true);
    setUploadError(null);
    setUploaded(false);
    try {
      await uploadResume(file);
      setUploaded(true);
      setResumeName(file.name);
      saveJobProfile({ resumeUploaded: true, resumeName: file.name });
    } catch (e: any) {
      setUploadError(e?.response?.data?.message || e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  /* ─── Tags ────────────────────────────────────────────────────────── */

  const addRole = () => {
    const v = roleInput.trim();
    if (v && !roles.includes(v)) setRoles((p) => [...p, v]);
    setRoleInput('');
  };
  const addLocation = () => {
    const v = locationInput.trim();
    if (v && !locations.includes(v)) setLocations((p) => [...p, v]);
    setLocationInput('');
  };

  /* ─── Navigation ──────────────────────────────────────────────────── */

  const canProceed = (): boolean => {
    if (step === 1) return !!(profile.name.trim() && profile.email.trim() && profile.phone.trim());
    if (step === 2) return uploaded;
    if (step === 3) return selectedPortals.length > 0;
    if (step === 4) return hasCredentialsFor(credentials, selectedPortals);
    if (step === 5) return roles.length > 0;
    return true;
  };

  const next = () => {
    if (!canProceed()) return;
    // Persist on advance
    if (step === 1) saveJobProfile({ profile });
    if (step === 4) saveJobProfile({ credentials });
    setStep((s) => Math.min(6, s + 1) as any);
  };

  const back = () => setStep((s) => Math.max(1, s - 1) as any);

  /* ─── Launch ──────────────────────────────────────────────────────── */

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const result = await launchJobAgent({
        portals: selectedPortals,
        roles,
        locations,
        maxApplications,
        dryRun,
        // Autonomous only applies when live; dry-run never submits anyway.
        autoApprove: dryRun ? false : autoApprove,
        userProfile: profile,
        credentials,
      });
      onLaunched(result);
    } catch (e: any) {
      setLaunchError(e?.response?.data?.message || e?.message || 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  /* ─── Render ──────────────────────────────────────────────────────── */

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-white/[0.08] bg-zinc-950 shadow-2xl"
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-72 rounded-full bg-red-500/10 blur-3xl" />

            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
                  <Briefcase className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Job Application Wizard</p>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                    Step {step} of 6 — {STEP_LABELS[step - 1]}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <StepDots current={step} total={6} />
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Step content */}
            <div className="min-h-[380px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                  className="p-6"
                >
                  {step === 1 && (
                    <StepProfile profile={profile} onChange={setProfile} />
                  )}
                  {step === 2 && (
                    <StepResume
                      file={resumeFile}
                      uploading={uploading}
                      uploaded={uploaded}
                      resumeName={resumeName}
                      error={uploadError}
                      dragging={dragging}
                      fileInputRef={fileInputRef}
                      onFile={handleFile}
                      onDrop={onDrop}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onRemove={() => {
                        setResumeFile(null); setUploaded(false); setUploadError(null);
                        saveJobProfile({ resumeUploaded: false, resumeName: undefined });
                      }}
                    />
                  )}
                  {step === 3 && (
                    <StepPlatforms selected={selectedPortals} onChange={setSelectedPortals} />
                  )}
                  {step === 4 && (
                    <StepCredentials
                      portals={selectedPortals}
                      credentials={credentials}
                      onChange={setCredentials}
                    />
                  )}
                  {step === 5 && (
                    <StepPreferences
                      roles={roles} roleInput={roleInput}
                      locations={locations} locationInput={locationInput}
                      maxApplications={maxApplications} dryRun={dryRun} autoApprove={autoApprove}
                      onRoleInputChange={setRoleInput} onAddRole={addRole}
                      onRemoveRole={(r) => setRoles((p) => p.filter((x) => x !== r))}
                      onLocationInputChange={setLocationInput} onAddLocation={addLocation}
                      onRemoveLocation={(l) => setLocations((p) => p.filter((x) => x !== l))}
                      onMaxChange={setMaxApplications} onDryRunChange={setDryRun}
                      onAutoApproveChange={setAutoApprove}
                    />
                  )}
                  {step === 6 && (
                    <StepReview
                      profile={profile}
                      resumeName={resumeName ?? resumeFile?.name}
                      portals={selectedPortals}
                      credentials={credentials}
                      roles={roles} locations={locations}
                      maxApplications={maxApplications} dryRun={dryRun} autoApprove={autoApprove}
                      launching={launching} error={launchError}
                      onLaunch={handleLaunch}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer nav */}
            {step < 6 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/20 px-6 py-4">
                <button
                  onClick={back}
                  disabled={step === 1}
                  className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 text-sm font-medium text-zinc-400 hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={next}
                  disabled={!canProceed()}
                  className="flex h-9 items-center gap-2 rounded-xl bg-red-500 px-5 text-sm font-bold text-white shadow-lg shadow-red-500/20 hover:bg-red-400 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Step 1: Profile ────────────────────────────────────────────────────────── */

function StepProfile({ profile, onChange }: { profile: UserProfile; onChange: (p: UserProfile) => void }) {
  const set = (key: keyof UserProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...profile, [key]: e.target.value });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Your Profile</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Used to fill contact fields in job applications automatically.
        </p>
      </div>

      <div className="space-y-3">
        <Field icon={<User className="h-4 w-4 text-zinc-500" />} label="Full Name" required>
          <input
            type="text"
            value={profile.name}
            onChange={set('name')}
            placeholder="Vinay Kumar"
            className="w-full h-10 bg-transparent px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </Field>

        <Field icon={<Mail className="h-4 w-4 text-zinc-500" />} label="Email" required>
          <input
            type="email"
            value={profile.email}
            onChange={set('email')}
            placeholder="vinay@example.com"
            className="w-full h-10 bg-transparent px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </Field>

        <Field icon={<Phone className="h-4 w-4 text-zinc-500" />} label="Phone" required>
          <input
            type="tel"
            value={profile.phone}
            onChange={set('phone')}
            placeholder="+91 98765 43210"
            className="w-full h-10 bg-transparent px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
        </Field>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 text-xs text-zinc-400">
        <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
        Profile is saved locally in your browser and never sent to any external service.
      </div>
    </div>
  );
}

function Field({ icon, label, required, children }: {
  icon: React.ReactNode; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/40 focus-within:border-red-500/30 transition-colors">
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        {required && <span className="ml-auto text-[10px] text-red-500">required</span>}
      </div>
      {children}
    </div>
  );
}

/* ─── Step 2: Resume ─────────────────────────────────────────────────────────── */

function StepResume({
  file, uploading, uploaded, resumeName, error, dragging, fileInputRef,
  onFile, onDrop, onDragOver, onDragLeave, onRemove,
}: {
  file: File | null; uploading: boolean; uploaded: boolean; resumeName?: string; error: string | null;
  dragging: boolean; fileInputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void; onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onRemove: () => void;
}) {
  // Already uploaded from a previous session
  if (uploaded && !file) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-bold text-white">Resume</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Your resume is already uploaded and ready.</p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{resumeName ?? 'resume'}</p>
            <p className="text-xs text-emerald-500/80 mt-0.5">Uploaded · ready to use</p>
          </div>
          <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-600 text-center">You can upload a new resume by clicking remove above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Upload Your Resume</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          The agent uses your resume to match and fill applications automatically.
        </p>
      </div>

      {!file ? (
        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 transition-all',
            dragging ? 'border-red-500/60 bg-red-500/[0.04]' : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.02]',
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <Upload className="h-6 w-6 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{dragging ? 'Drop here' : 'Drag & drop or click to browse'}</p>
            <p className="mt-1 text-xs text-zinc-600">PDF, DOCX, DOC, TXT</p>
          </div>
        </div>
      ) : (
        <div className={cn(
          'flex items-center gap-4 rounded-2xl border p-4',
          uploaded ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.08]',
        )}>
          <div className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border',
            uploaded ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/[0.08] text-zinc-400',
          )}>
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : uploaded ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{file.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {uploading ? 'Uploading...' : uploaded ? 'Uploaded successfully' : 'Processing...'} · {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          {!uploading && (
            <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

/* ─── Step 3: Platforms ──────────────────────────────────────────────────────── */

function StepPlatforms({ selected, onChange }: { selected: string[]; onChange: (p: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Select Job Platforms</h2>
        <p className="mt-0.5 text-sm text-zinc-500">The agent applies on all selected platforms.</p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {PORTALS.map((p) => {
          const active = selected.includes(p.id);
          return (
            <motion.button
              key={p.id} type="button" whileTap={{ scale: 0.97 }}
              onClick={() => toggle(p.id)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all',
                active ? cn('bg-white/[0.04]', p.activeBorder) : 'border-white/[0.07] hover:bg-white/[0.03]',
              )}
            >
              <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', p.bg)}>{p.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-[11px] text-zinc-500 truncate">{p.desc}</p>
              </div>
              <div className={cn('flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-all', active ? 'border-red-500 bg-red-500' : 'border-white/20')}>
                {active && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step 4: Credentials ────────────────────────────────────────────────────── */

function StepCredentials({
  portals, credentials, onChange,
}: {
  portals: string[];
  credentials: Record<string, PortalCredential>;
  onChange: (c: Record<string, PortalCredential>) => void;
}) {
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});

  const set = (portalId: string, field: 'email' | 'password', value: string) => {
    onChange({
      ...credentials,
      [portalId]: { email: credentials[portalId]?.email ?? '', password: credentials[portalId]?.password ?? '', [field]: value },
    });
  };

  const selectedDefs = PORTALS.filter((p) => portals.includes(p.id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Portal Credentials</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Saved locally — used to auto-login so the agent can start immediately.
        </p>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
        {selectedDefs.map((p) => {
          const cred = credentials[p.id] ?? { email: '', password: '' };
          const saved = !!(cred.email.trim() && cred.password.trim());
          return (
            <div key={p.id} className={cn(
              'rounded-2xl border p-4 transition-all',
              saved ? 'border-emerald-500/20 bg-emerald-500/[0.02]' : 'border-white/[0.07] bg-black/20',
            )}>
              <div className="mb-3 flex items-center gap-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', p.bg)}>{p.icon}</div>
                <span className="text-sm font-semibold text-white">{p.name}</span>
                {saved && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                    <Lock className="h-2.5 w-2.5" /> Saved
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2">
                  <Mail className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                  <input
                    type="email"
                    value={cred.email}
                    onChange={(e) => set(p.id, 'email', e.target.value)}
                    placeholder={`${p.name} email`}
                    className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/40 px-3 py-2">
                  <KeyRound className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                  <input
                    type={showPw[p.id] ? 'text' : 'password'}
                    value={cred.password}
                    onChange={(e) => set(p.id, 'password', e.target.value)}
                    placeholder="Password"
                    className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => ({ ...v, [p.id]: !v[p.id] }))}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    {showPw[p.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] px-4 py-3 text-xs text-zinc-400">
        <Info className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
        Credentials are stored only in your browser (never sent to any server). The agent uses them to auto-login before applying.
      </div>
    </div>
  );
}

/* ─── Step 5: Preferences ────────────────────────────────────────────────────── */

function StepPreferences({
  roles, roleInput, locations, locationInput, maxApplications, dryRun, autoApprove,
  onRoleInputChange, onAddRole, onRemoveRole, onLocationInputChange, onAddLocation, onRemoveLocation,
  onMaxChange, onDryRunChange, onAutoApproveChange,
}: {
  roles: string[]; roleInput: string; locations: string[]; locationInput: string;
  maxApplications: number; dryRun: boolean; autoApprove: boolean;
  onRoleInputChange: (v: string) => void; onAddRole: () => void; onRemoveRole: (r: string) => void;
  onLocationInputChange: (v: string) => void; onAddLocation: () => void; onRemoveLocation: (l: string) => void;
  onMaxChange: (n: number) => void; onDryRunChange: (v: boolean) => void;
  onAutoApproveChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Job Preferences</h2>
        <p className="mt-0.5 text-sm text-zinc-500">What roles, where, and how many.</p>
      </div>

      {/* Roles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          <Briefcase className="h-3.5 w-3.5 text-red-400" /> Target Roles <span className="text-red-400">*</span>
        </label>
        <div className="flex gap-2">
          <input type="text" value={roleInput} onChange={(e) => onRoleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddRole()}
            placeholder="e.g. Senior React Developer"
            className="flex-1 h-9 rounded-xl border border-white/[0.07] bg-black/40 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-red-500/40 focus:outline-none"
          />
          <button type="button" onClick={onAddRole} disabled={!roleInput.trim()}
            className="h-9 w-9 rounded-xl bg-red-500 text-white flex items-center justify-center disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 min-h-[28px]">
          {roles.map((r) => (
            <span key={r} className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.07] px-2.5 py-1 text-xs text-red-300">
              {r}
              <button onClick={() => onRemoveRole(r)} className="text-red-400/60 hover:text-red-300"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {roles.length === 0 && <p className="text-xs text-zinc-600 italic">Add at least one role</p>}
        </div>
      </div>

      {/* Locations */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          <MapPin className="h-3.5 w-3.5 text-blue-400" /> Preferred Locations <span className="text-zinc-600">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input type="text" value={locationInput} onChange={(e) => onLocationInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddLocation()}
            placeholder="e.g. Bangalore, Remote"
            className="flex-1 h-9 rounded-xl border border-white/[0.07] bg-black/40 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />
          <button type="button" onClick={onAddLocation} disabled={!locationInput.trim()}
            className="h-9 w-9 rounded-xl bg-blue-500/20 border border-blue-500/20 text-blue-300 flex items-center justify-center disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <span key={l} className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-2.5 py-1 text-xs text-blue-300">
              {l} <button onClick={() => onRemoveLocation(l)} className="text-blue-400/60 hover:text-blue-300"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      </div>

      {/* Max + dry run in a row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            <SlidersHorizontal className="h-3.5 w-3.5 text-purple-400" /> Max Applications
          </label>
          <span className="text-base font-bold text-white">{maxApplications}</span>
        </div>
        <input type="range" min={1} max={25} value={maxApplications} onChange={(e) => onMaxChange(Number(e.target.value))} className="w-full accent-red-500" />
      </div>

      <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.01] p-3.5 hover:bg-white/[0.02] transition-all">
        <div className="relative mt-0.5">
          <input type="checkbox" checked={dryRun} onChange={(e) => onDryRunChange(e.target.checked)} className="sr-only" />
          <div className={cn('h-4 w-4 rounded border-2 flex items-center justify-center transition-all', dryRun ? 'border-red-500 bg-red-500' : 'border-white/20 bg-transparent')}>
            {dryRun && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Dry Run <span className="ml-1 text-[10px] text-amber-400 font-mono uppercase bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">Recommended</span></p>
          <p className="text-xs text-zinc-500 mt-0.5">Full apply flow without final submit.</p>
        </div>
      </label>

      {/* Live-mode submit choice — only relevant when NOT a dry run */}
      {!dryRun && (
        <div className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Live mode — how should it submit?
          </p>
          <SubmitModeOption
            active={!autoApprove}
            onClick={() => onAutoApproveChange(false)}
            title="Approve each job"
            desc="Pause for your approval in the dashboard before every real submit."
          />
          <SubmitModeOption
            active={autoApprove}
            onClick={() => onAutoApproveChange(true)}
            title="Fully autonomous"
            desc="Submit every matching job automatically — no approval click."
          />
        </div>
      )}
    </div>
  );
}

function SubmitModeOption({
  active, onClick, title, desc,
}: {
  active: boolean; onClick: () => void; title: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all',
        active ? 'border-red-500/60 bg-red-500/[0.06]' : 'border-white/[0.07] hover:bg-white/[0.02]',
      )}
    >
      <div className={cn(
        'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all',
        active ? 'border-red-500' : 'border-white/20',
      )}>
        {active && <div className="h-2 w-2 rounded-full bg-red-500" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
      </div>
    </button>
  );
}

/* ─── Step 6: Review & Launch ────────────────────────────────────────────────── */

function StepReview({
  profile, resumeName, portals, credentials, roles, locations, maxApplications, dryRun, autoApprove, launching, error, onLaunch,
}: {
  profile: UserProfile; resumeName?: string; portals: string[]; credentials: Record<string, PortalCredential>;
  roles: string[]; locations: string[]; maxApplications: number; dryRun: boolean; autoApprove: boolean;
  launching: boolean; error: string | null; onLaunch: () => void;
}) {
  const modeLabel = dryRun
    ? 'Dry Run'
    : autoApprove
      ? '⚠ Live — autonomous (submit all)'
      : '⚠ Live — approve each job';
  const portalDefs = PORTALS.filter((p) => portals.includes(p.id));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Review & Launch</h2>
        <p className="mt-0.5 text-sm text-zinc-500">Everything looks good? Launch the agent.</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
        <ReviewRow label="Name" value={profile.name} icon={<User className="h-3.5 w-3.5 text-zinc-400" />} />
        <ReviewRow label="Email" value={profile.email} icon={<Mail className="h-3.5 w-3.5 text-zinc-400" />} />
        <ReviewRow label="Phone" value={profile.phone} icon={<Phone className="h-3.5 w-3.5 text-zinc-400" />} />
        <ReviewRow label="Resume" value={resumeName ?? '—'} icon={<FileText className="h-3.5 w-3.5 text-emerald-400" />} />
        <ReviewRow
          label="Portals"
          value={
            <div className="flex flex-wrap gap-1 justify-end">
              {portalDefs.map((p) => {
                const hasCreds = !!(credentials[p.id]?.email && credentials[p.id]?.password);
                return (
                  <span key={p.id} className={cn(
                    'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono',
                    hasCreds ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-white/10 text-zinc-400',
                  )}>
                    {hasCreds && <Lock className="h-2.5 w-2.5" />}
                    {p.name}
                  </span>
                );
              })}
            </div>
          }
          icon={<Globe className="h-3.5 w-3.5 text-blue-400" />}
        />
        <ReviewRow label="Roles" value={roles.join(', ') || 'Any'} icon={<Briefcase className="h-3.5 w-3.5 text-red-400" />} />
        {locations.length > 0 && <ReviewRow label="Locations" value={locations.join(', ')} icon={<MapPin className="h-3.5 w-3.5 text-yellow-400" />} />}
        <ReviewRow label="Max" value={`${maxApplications} jobs`} icon={<SlidersHorizontal className="h-3.5 w-3.5 text-purple-400" />} />
        <ReviewRow
          label="Mode"
          value={modeLabel}
          icon={<CheckCircle2 className={cn('h-3.5 w-3.5', dryRun ? 'text-amber-400' : 'text-red-400')} />}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
        onClick={onLaunch} disabled={launching}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:from-red-400 hover:to-red-500 disabled:opacity-60 disabled:pointer-events-none transition-all"
      >
        {launching ? <><Loader2 className="h-5 w-5 animate-spin" />Launching Agent…</> : <><Rocket className="h-5 w-5" />Launch Job Agent</>}
      </motion.button>
    </div>
  );
}

function ReviewRow({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2 min-w-[90px] flex-shrink-0">
        {icon}
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      {typeof value === 'string' ? (
        <span className="text-xs text-zinc-300 text-right font-medium">{value}</span>
      ) : (
        value
      )}
    </div>
  );
}
