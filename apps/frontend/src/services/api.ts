import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/* ===========================================================
   API CLIENT
=========================================================== */

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // send cookies (needed for CSRF cookie)
  timeout: 30000, // 30s timeout
});

/* ===========================================================
   CSRF TOKEN MANAGEMENT
   The backend uses double-csrf: a GET to /auth/csrf-token sets
   the csrf-token cookie, and every state-mutating request must
   echo it back in the x-csrf-token header.
=========================================================== */

let csrfTokenPromise: Promise<void> | null = null;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function ensureCsrfToken(): Promise<void> {
  if (getCookie('csrf-token')) return Promise.resolve();
  if (!csrfTokenPromise) {
    csrfTokenPromise = axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/auth/csrf-token`,
        { withCredentials: true },
      )
      .then(() => {
        csrfTokenPromise = null;
      })
      .catch(() => {
        csrfTokenPromise = null;
      });
  }
  return csrfTokenPromise;
}

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);


/* ===========================================================
   REQUEST INTERCEPTOR
   Attach token to every request
=========================================================== */

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Attach CSRF token for all state-mutating requests
      if (MUTATING_METHODS.has((config.method || '').toLowerCase())) {
        await ensureCsrfToken();
        const csrfToken = getCookie('csrf-token');
        if (csrfToken && config.headers) {
          config.headers['x-csrf-token'] = csrfToken;
        }
      }
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/* ===========================================================
   RESPONSE INTERCEPTOR
   Handle 401 and token refresh
=========================================================== */

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Auth endpoints must NEVER trigger the refresh-and-redirect flow: a 401
    // from /auth/login means "wrong credentials" (the page shows it), and
    // /auth/me 401 on load is handled by the auth store itself. Treating those
    // as an expired session would wipe localStorage and reload /login, hiding
    // the real error from the user.
    const reqUrl = originalRequest?.url || '';
    const isAuthRoute = /\/auth\/(login|register|refresh|me)/.test(reqUrl);

    // If 401 and we haven't retried yet, try to refresh token
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthRoute &&
      typeof window !== 'undefined'
    ) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        // No refresh token, redirect to login
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Attempt token refresh
        const res = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/auth/refresh`,
          { refreshToken },
        );

        const { accessToken } = res.data;
        localStorage.setItem('token', accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        processQueue(null, accessToken);
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(error, null);
        isRefreshing = false;
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Log errors for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Error]', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    return Promise.reject(error);
  },
);