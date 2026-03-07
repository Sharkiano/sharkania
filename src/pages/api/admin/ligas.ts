// src/pages/api/admin/ligas.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const GET: APIRoute = async () => {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('leagues')
    .select(`
      *,
      clubs ( id, name, slug )
    `)
    .order('name');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ leagues: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    name?: string;
    slug?: string;
    club_id?: number;
    description?: string;
    season_start?: string;
    season_end?: string;
    scoring_system?: Record<string, unknown>;
  };

  const name    = body.name?.trim() ?? '';
  const slug    = body.slug?.trim() ?? '';
  const club_id = body.club_id;

  if (!name || !slug || !club_id) {
    return new Response(
      JSON.stringify({ error: 'Nombre, slug y club son requeridos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response(
      JSON.stringify({ error: 'El slug solo puede contener letras minúsculas, números y guiones.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Sistema de puntaje por defecto si no se provee
  const defaultScoring = {
    type: 'position_based',
    maxPositionsPaid: 10,
    points: { '1': 100, '2': 80, '3': 65, '4': 55, '5': 45, '6': 38, '7': 32, '8': 27, '9': 23, '10': 20 },
    participationPoints: 5,
    bonusBountyPoints: 2,
    bestNof: null,
  };

  const { data, error } = await supabase
    .from('leagues')
    .insert({
      name,
      slug,
      club_id,
      description:    body.description?.trim()  || null,
      season_start:   body.season_start          || null,
      season_end:     body.season_end            || null,
      scoring_system: body.scoring_system        || defaultScoring,
      is_active:      true,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe una liga con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ league: data }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    id?: number;
    name?: string;
    slug?: string;
    club_id?: number;
    description?: string;
    season_start?: string | null;
    season_end?: string | null;
    scoring_system?: Record<string, unknown>;
    is_active?: boolean;
  };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Record<string, unknown> = {};
  if (body.name           !== undefined) updates.name           = body.name.trim();
  if (body.slug           !== undefined) updates.slug           = body.slug.trim();
  if (body.club_id        !== undefined) updates.club_id        = body.club_id;
  if (body.description    !== undefined) updates.description    = body.description?.trim() || null;
  if (body.season_start   !== undefined) updates.season_start   = body.season_start   || null;
  if (body.season_end     !== undefined) updates.season_end     = body.season_end     || null;
  if (body.scoring_system !== undefined) updates.scoring_system = body.scoring_system;
  if (body.is_active      !== undefined) updates.is_active      = body.is_active;

  const { data, error } = await supabase
    .from('leagues')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    const msg = error.code === '23505'
      ? 'Ya existe una liga con ese slug.'
      : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ league: data }), {
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
    .eq('league_id', body.id);

  if (count && count > 0) {
    return new Response(
      JSON.stringify({ error: `No se puede eliminar: tiene ${count} torneo(s). Desactivala en su lugar.` }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { error } = await supabase
    .from('leagues')
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