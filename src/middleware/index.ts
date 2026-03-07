// src/middleware/index.ts
import { defineMiddleware } from 'astro:middleware';
import { createServerClient } from '@lib/supabase/server';

// Rutas de login — NO proteger estas
const LOGIN_PAGES = ['/admin/login', '/club-admin/login'];

// Prefijos protegidos y su rol requerido
const PROTECTED: Record<string, 'super_admin' | 'club_admin'> = {
  '/admin':      'super_admin',
  '/api/admin':  'super_admin',   // ← endpoints API del super admin
  '/club-admin': 'club_admin',
  '/api/club-admin': 'club_admin', // ← endpoints API del club admin
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // ── Si es página de login o ruta pública, pasar directo ──
  if (LOGIN_PAGES.includes(pathname)) {
    return next();
  }

  // ── Buscar si la ruta está protegida ─────────────────────
  const matchedPrefix = Object.keys(PROTECTED).find(prefix =>
    pathname.startsWith(prefix)
  );

  // Si no es ruta protegida, continuar normalmente
  if (!matchedPrefix) {
    return next();
  }

  // ── Verificar sesión ─────────────────────────────────────
  const accessToken  = context.cookies.get('sb-access-token')?.value;
  const refreshToken = context.cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    const loginUrl = matchedPrefix === '/admin' ? '/admin/login' : '/club-admin/login';
    return context.redirect(loginUrl);
  }

  const supabase = createServerClient();
  let adminProfile = null;

  try {
    const { data: sessionData } = await supabase.auth.setSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
    });

    if (sessionData.session) {
      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('id, role, club_id, is_active')
        .eq('id', sessionData.session.user.id)
        .single();

      if (profile?.is_active) {
        adminProfile = profile;
      }
    }
  } catch {
    context.cookies.delete('sb-access-token', { path: '/' });
    context.cookies.delete('sb-refresh-token', { path: '/' });
  }

  if (!adminProfile) {
    const loginUrl = matchedPrefix === '/admin' ? '/admin/login' : '/club-admin/login';
    return context.redirect(loginUrl);
  }

  // Verificar rol correcto
  if (matchedPrefix === '/admin' && adminProfile.role !== 'super_admin') {
    return context.redirect('/club-admin');
  }

  // Inyectar en locals
  context.locals.adminProfile = adminProfile;

  return next();
});