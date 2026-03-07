// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const accessToken  = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (accessToken && refreshToken) {
    try {
      const supabase = createServerClient();
      await supabase.auth.setSession({
        access_token:  accessToken,
        refresh_token: refreshToken,
      });
      await supabase.auth.signOut();
    } catch {
      // Continuar aunque falle el signOut remoto
    }
  }

  // Limpiar cookies siempre
  cookies.delete('sb-access-token',  { path: '/' });
  cookies.delete('sb-refresh-token', { path: '/' });

  return redirect('/');
};