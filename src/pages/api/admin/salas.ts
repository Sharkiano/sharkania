// src/pages/api/admin/salas.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

// ── GET: listar salas ────────────────────────────────────
export const GET: APIRoute = async () => {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .order('name');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ rooms: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ── POST: crear sala ─────────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { name?: string; slug?: string };

  const name = body.name?.trim() ?? '';
  const slug = body.slug?.trim() ?? '';

  if (!name || !slug) {
    return new Response(JSON.stringify({ error: 'Nombre y slug son requeridos.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validar slug formato
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response(
      JSON.stringify({ error: 'El slug solo puede contener letras minúsculas, números y guiones.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert({ name, slug, is_active: true })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe una sala con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ room: data }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ── PATCH: editar sala o toggle activo ───────────────────
export const PATCH: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as {
    id?: number;
    name?: string;
    slug?: string;
    is_active?: boolean;
  };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Construir objeto de actualización solo con campos presentes
  const updates: Record<string, unknown> = {};
  if (body.name      !== undefined) updates.name      = body.name.trim();
  if (body.slug      !== undefined) updates.slug      = body.slug.trim();
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No hay campos para actualizar.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe una sala con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ room: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ── DELETE: eliminar sala (solo si no tiene torneos) ─────
export const DELETE: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { id?: number };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar que no tenga torneos asociados
  const { count } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', body.id);

  if (count && count > 0) {
    return new Response(
      JSON.stringify({ error: `No se puede eliminar: tiene ${count} torneo(s) asociado(s). Desactivala en su lugar.` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', body.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};