'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getDashboardRoute, getSession, type Role } from '@/lib/auth';
import { Api, ApiError, errorMessage, type Me } from '@/lib/api';

/**
 * Protects a page. Redirects to / without a session and to the right dashboard for
 * another role. Confirms the session with GET /api/me (refreshing the token if needed)
 * and returns the account plus its role record (citizen_profile / hospital / ambulance).
 */
export function useAuth(requiredRole: Role | null) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = getSession();
    if (!s) { if (requiredRole !== null) { router.replace('/'); return; } setChecking(false); return; }
    if (requiredRole !== null && s.account.role !== requiredRole) { router.replace(getDashboardRoute(s.account.role)); return; }
    try {
      const m = await Api.me();
      if (requiredRole !== null && m.account.role !== requiredRole) { router.replace(getDashboardRoute(m.account.role)); return; }
      setMe(m);
      setError(null);
      setChecking(false);
    } catch (e) {
      // 401 already redirected inside the API client. Anything else: show it with a retry.
      if (e instanceof ApiError && e.status === 401) return;
      setError(errorMessage(e));
      setChecking(false);
    }
  }, [router, requiredRole]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const logout = useCallback(() => {
    clearSession();
    router.replace('/');
  }, [router]);

  return { me, account: me?.account ?? null, checking, error, reload: load, setMe, logout };
}
