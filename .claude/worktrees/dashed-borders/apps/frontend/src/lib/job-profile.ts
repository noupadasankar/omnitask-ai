// User profile + portal credentials persisted in localStorage.
// Stored base64-encoded so passwords aren't plain-text visible.

const KEY = 'omnitask_job_profile';

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
}

export interface PortalCredential {
  email: string;
  password: string;
}

export interface JobProfile {
  profile: UserProfile;
  credentials: Record<string, PortalCredential>;
  resumeUploaded: boolean;
  resumeName?: string;
}

const DEFAULT: JobProfile = {
  profile: { name: '', email: '', phone: '' },
  credentials: {},
  resumeUploaded: false,
};

export function loadJobProfile(): JobProfile {
  if (typeof window === 'undefined') return { ...DEFAULT, profile: { ...DEFAULT.profile } };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, profile: { ...DEFAULT.profile } };
    const parsed = JSON.parse(atob(raw));
    return {
      ...DEFAULT,
      ...parsed,
      profile: { ...DEFAULT.profile, ...(parsed.profile ?? {}) },
      credentials: parsed.credentials ?? {},
    };
  } catch {
    return { ...DEFAULT, profile: { ...DEFAULT.profile } };
  }
}

export function saveJobProfile(patch: Partial<JobProfile>): void {
  if (typeof window === 'undefined') return;
  const current = loadJobProfile();
  const next: JobProfile = {
    ...current,
    ...patch,
    profile: { ...current.profile, ...(patch.profile ?? {}) },
    credentials: { ...current.credentials, ...(patch.credentials ?? {}) },
  };
  localStorage.setItem(KEY, btoa(JSON.stringify(next)));
}

export function clearJobProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

export function hasCompleteProfile(p: UserProfile): boolean {
  return !!(p.name.trim() && p.email.trim() && p.phone.trim());
}

export function hasCredentialsFor(
  creds: Record<string, PortalCredential>,
  portals: string[],
): boolean {
  return portals.every((p) => !!(creds[p]?.email?.trim() && creds[p]?.password?.trim()));
}
