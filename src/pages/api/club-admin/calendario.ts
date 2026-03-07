// src/pages/api/club-admin/calendario.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const POST: APIRoute = async ({ request, locals }) => {
  const adminProfile = locals.adminProfile;
  if (!adminProfile?.club_id) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServerClient();

  const body = await request.json() as {
    name?: string;
    scheduled_date?: string;
    scheduled_time?: string | null;
    league_id?: number | null;
    room_id?: number | null;
    buy_in?: number | null;
    currency?: string;
    details?: string | null;
  };

  if (!body.name?.trim() || !body.scheduled_date) {
    return new Response(JSON.stringify({ error: 'Nombre y fecha son requeridos.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Obtener timezone del club via su país
  const { data: clubData } = await (supabase as any)
    .from('clubs')
    .select('countries ( timezone )')
    .eq('id', adminProfile.club_id)
    .single();

  const timezone = (clubData?.countries as any)?.timezone ?? 'UTC';

  const { data, error } = await (supabase as any)
    .from('scheduled_tournaments')
    .insert({
      club_id:        adminProfile.club_id,
      name:           body.name.trim(),
      scheduled_date: body.scheduled_date,
      scheduled_time: body.scheduled_time || null,
      timezone,
      league_id:      body.league_id || null,
      room_id:        body.room_id   || null,
      buy_in:         body.buy_in    || null,
      currency:       body.currency  || 'USD',
      details:        body.details   || null,
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ event: data }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const adminProfile = locals.adminProfile;
  if (!adminProfile?.club_id) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServerClient();
  const body = await request.json() as { id?: number };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error } = await (supabase as any)
    .from('scheduled_tournaments')
    .delete()
    .eq('id', body.id)
    .eq('club_id', adminProfile.club_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};