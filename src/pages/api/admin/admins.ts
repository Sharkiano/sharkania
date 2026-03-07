// src/pages/api/admin/admins.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const GET: APIRoute = async () => {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('admin_profiles')
    .select(`
      *,
      clubs ( id, name, slug )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ admins: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    email?: string;
    name?: string;
    password?: string;
    club_id?: number;
    role?: 'super_admin' | 'club_admin';
  };

  const email    = body.email?.trim().toLowerCase() ?? '';
  const name     = body.name?.trim() ?? '';
  const password = body.password ?? '';
  const club_id  = body.club_id  || null;
  const role     = body.role     || 'club_admin';

  if (!email || !name || !password) {
    return new Response(
      JSON.stringify({ error: 'Email, nombre y contraseña son requeridos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (role === 'club_admin' && !club_id) {
    return new Response(
      JSON.stringify({ error: 'Un admin de club debe tener un club asignado.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Confirmar email automáticamente
  });

  if (authError || !authData.user) {
    const msg = authError?.message.includes('already registered')
      ? 'Ya existe un usuario con ese email.'
      : authError?.message ?? 'Error al crear usuario.';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Crear perfil en admin_profiles
  const { data: profile, error: profileError } = await supabase
    .from('admin_profiles')
    .insert({
      id:        authData.user.id,
      email,
      name,
      role,
      club_id,
      is_active: true,
    })
    .select()
    .single();

  if (profileError) {
    // Rollback: eliminar usuario de Auth si falla el perfil
    await supabase.auth.admin.deleteUser(authData.user.id);
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ admin: profile }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    id?: string;
    name?: string;
    club_id?: number | null;
    is_active?: boolean;
  };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Record<string, unknown> = {};
  if (body.name      !== undefined) updates.name      = body.name.trim();
  if (body.club_id   !== undefined) updates.club_id   = body.club_id || null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from('admin_profiles')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Si se desactiva, también deshabilitar en Auth
  if (body.is_active === false) {
    await supabase.auth.admin.updateUserById(body.id, {
      ban_duration: '87600h', // 10 años = efectivamente bloqueado
    });
  } else if (body.is_active === true) {
    await supabase.auth.admin.updateUserById(body.id, {
      ban_duration: 'none',
    });
  }

  return new Response(JSON.stringify({ admin: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { id?: string };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Eliminar de Auth (el CASCADE elimina admin_profiles automáticamente)
  const { error } = await supabase.auth.admin.deleteUser(body.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};