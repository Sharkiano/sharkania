// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email    = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  const panel    = formData.get('panel')?.toString() ?? 'club-admin'; // 'admin' | 'club-admin'

  // Validación básica
  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: 'Email y contraseña son requeridos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createServerClient();

  // Autenticar con Supabase Auth
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return new Response(
      JSON.stringify({ error: 'Email o contraseña incorrectos.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar que el usuario tiene perfil de admin activo
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('id, role, club_id, is_active')
    .eq('id', data.session.user.id)
    .single();

  if (!profile || !profile.is_active) {
    return new Response(
      JSON.stringify({ error: 'No tienes acceso al panel de administración.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar que el rol corresponde al panel solicitado
  if (panel === 'admin' && profile.role !== 'super_admin') {
    return new Response(
      JSON.stringify({ error: 'No tienes permisos de Super Admin.' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Guardar tokens en cookies httpOnly
  const cookieOptions = {
    path:     '/',
    httpOnly: true,
    secure:   import.meta.env.PROD,
    sameSite: 'lax' as const,
    maxAge:   60 * 60 * 24 * 7, // 7 días
  };

  cookies.set('sb-access-token',  data.session.access_token,  cookieOptions);
  cookies.set('sb-refresh-token', data.session.refresh_token, cookieOptions);

  // Actualizar last_login
  await supabase
    .from('admin_profiles')
    .update({ last_login: new Date().toISOString() })
    .eq('id', profile.id);

  // Redirigir al panel correspondiente
  const redirectTo = profile.role === 'super_admin' ? '/admin' : '/club-admin';

  return new Response(
    JSON.stringify({ success: true, redirectTo }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};