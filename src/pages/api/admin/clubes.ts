// src/pages/api/admin/clubes.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const GET: APIRoute = async () => {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('clubs')
    .select(`
      *,
      countries ( id, name, flag_emoji, code ),
      rooms     ( id, name, slug )
    `)
    .order('name');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ clubs: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    name?: string;
    slug?: string;
    description?: string;
    country_id?: number;
    room_id?: number;
    contact_info?: Record<string, string>;
  };

  const name = body.name?.trim() ?? '';
  const slug = body.slug?.trim() ?? '';

  if (!name || !slug) {
    return new Response(JSON.stringify({ error: 'Nombre y slug son requeridos.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response(
      JSON.stringify({ error: 'El slug solo puede contener letras minúsculas, números y guiones.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('clubs')
    .insert({
      name,
      slug,
      description:  body.description?.trim() || null,
      country_id:   body.country_id  || null,
      room_id:      body.room_id     || null,
      contact_info: body.contact_info || {},
      is_active:    true,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe un club con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ club: data }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    id?: number;
    name?: string;
    slug?: string;
    description?: string;
    country_id?: number | null;
    room_id?: number | null;
    contact_info?: Record<string, string>;
    is_active?: boolean;
  };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Record<string, unknown> = {};
  if (body.name        !== undefined) updates.name        = body.name.trim();
  if (body.slug        !== undefined) updates.slug        = body.slug.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.country_id  !== undefined) updates.country_id  = body.country_id  || null;
  if (body.room_id     !== undefined) updates.room_id     = body.room_id     || null;
  if (body.contact_info !== undefined) updates.contact_info = body.contact_info;
  if (body.is_active   !== undefined) updates.is_active   = body.is_active;

  const { data, error } = await supabase
    .from('clubs')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe un club con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ club: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { id?: number };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar torneos asociados
  const { count } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact', head: true })
    .eq('club_id', body.id);

  if (count && count > 0) {
    return new Response(
      JSON.stringify({ error: `No se puede eliminar: tiene ${count} torneo(s). Desactivalo en su lugar.` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Desvincular admin_profiles que apunten a este club
  await supabase
    .from('admin_profiles')
    .update({ club_id: null })
    .eq('club_id', body.id);

  const { error } = await supabase
    .from('clubs')
    .delete()
    .eq('id', body.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};