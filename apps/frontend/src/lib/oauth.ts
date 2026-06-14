/**
 * Builds the absolute URL that begins the Google OAuth redirect flow.
 * The backend mounts auth routes under the same base as the REST API
 * (NEXT_PUBLIC_API_URL already includes the `/api` prefix).
 */
export function getGoogleAuthUrl(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  return `${apiBase.replace(/\/$/, '')}/auth/google`;
}
