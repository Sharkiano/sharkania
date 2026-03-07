// src/pages/api/admin/jugadores.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const GET: APIRoute = async ({ url }) => {
  const supabase = createServerClient();
  const search   = url.searchParams.get('q')?.trim() ?? '';
  const page     = Number(url.searchParams.get('page') ?? 1);
  const limit    = 50;
  const offset   = (page - 1) * limit;

  let query = supabase
    .from('players')
    .select(`
      id, nickname, slug, elo_rating, total_tournaments,
      total_first_places, total_podiums, is_active,
      first_seen, last_seen,
      countries ( name, flag_emoji, code )
    `, { count: 'exact' })
    .order('elo_rating', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.ilike('nickname', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ players: data, total: count, page, limit }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    id?: number;
    nickname?: string;
    country_id?: number | null;
    is_active?: boolean;
  };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates: Record<string, unknown> = {};
  if (body.nickname   !== undefined) updates.nickname   = body.nickname.trim();
  if (body.country_id !== undefined) updates.country_id = body.country_id || null;
  if (body.is_active  !== undefined) updates.is_active  = body.is_active;

  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ player: data }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// ── POST: fusionar jugadores ─────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body = await request.json() as {
    action?: string;
    keep_id?: number;   // Jugador que se mantiene
    merge_id?: number;  // Jugador que se elimina
  };

  if (body.action !== 'merge') {
    return new Response(JSON.stringify({ error: 'Acción no válida.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { keep_id, merge_id } = body;

  if (!keep_id || !merge_id || keep_id === merge_id) {
    return new Response(
      JSON.stringify({ error: 'Se requieren dos jugadores distintos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar que ambos jugadores existen
  const [{ data: keepPlayer }, { data: mergePlayer }] = await Promise.all([
    supabase.from('players').select('*').eq('id', keep_id).single(),
    supabase.from('players').select('*').eq('id', merge_id).single(),
  ]);

  if (!keepPlayer || !mergePlayer) {
    return new Response(JSON.stringify({ error: 'Uno o ambos jugadores no encontrados.' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 1. Reasignar tournament_results ─────────────────
  // Verificar que no haya conflicto (mismo torneo, mismo jugador)
  const { data: conflictResults } = await supabase
    .from('tournament_results')
    .select('tournament_id')
    .eq('player_id', keep_id);

  const keepTournamentIds = new Set(conflictResults?.map(r => r.tournament_id) ?? []);

  const { data: mergeResults } = await supabase
    .from('tournament_results')
    .select('tournament_id, id')
    .eq('player_id', merge_id);

  // Eliminar resultados duplicados (mismo torneo en ambos perfiles)
  const duplicateIds = mergeResults
    ?.filter(r => keepTournamentIds.has(r.tournament_id))
    .map(r => r.id) ?? [];

  if (duplicateIds.length > 0) {
    await supabase
      .from('tournament_results')
      .delete()
      .in('id', duplicateIds);
  }

  // Reasignar los no duplicados
  await supabase
    .from('tournament_results')
    .update({ player_id: keep_id })
    .eq('player_id', merge_id);

  // ── 2. Reasignar player_room_nicks ───────────────────
  const { data: keepNicks } = await supabase
    .from('player_room_nicks')
    .select('room_id, nickname')
    .eq('player_id', keep_id);

  const keepNickKeys = new Set(
    keepNicks?.map(n => `${n.room_id}-${n.nickname.toLowerCase()}`) ?? []
  );

  const { data: mergeNicks } = await supabase
    .from('player_room_nicks')
    .select('id, room_id, nickname')
    .eq('player_id', merge_id);

  // Eliminar nicks duplicados
  const duplicateNickIds = mergeNicks
    ?.filter(n => keepNickKeys.has(`${n.room_id}-${n.nickname.toLowerCase()}`))
    .map(n => n.id) ?? [];

  if (duplicateNickIds.length > 0) {
    await supabase
      .from('player_room_nicks')
      .delete()
      .in('id', duplicateNickIds);
  }

  // Reasignar los no duplicados
  await supabase
    .from('player_room_nicks')
    .update({ player_id: keep_id })
    .eq('player_id', merge_id);

  // ── 3. Reasignar elo_history ─────────────────────────
  await supabase
    .from('elo_history')
    .update({ player_id: keep_id })
    .eq('player_id', merge_id);

  // ── 4. Reasignar league_standings ───────────────────
  await supabase
    .from('league_standings')
    .delete()
    .eq('player_id', merge_id);

  // ── 5. Recalcular stats del jugador que se mantiene ──
  const { data: allResults } = await supabase
    .from('tournament_results')
    .select('position, tournament_id')
    .eq('player_id', keep_id);

  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id, total_players, date')
    .in('id', allResults?.map(r => r.tournament_id) ?? []);

  const tournamentMap = new Map(allTournaments?.map(t => [t.id, t]) ?? []);

  let totalFirst   = 0;
  let totalPodiums = 0;
  let totalFinals  = 0;
  let lastSeen     = keepPlayer.first_seen;

  for (const result of allResults ?? []) {
    const t = tournamentMap.get(result.tournament_id);
    if (!t) continue;
    const threshold = Math.max(1, Math.ceil(t.total_players * 0.1));
    if (result.position === 1)        totalFirst++;
    if (result.position <= 3)         totalPodiums++;
    if (result.position <= threshold) totalFinals++;
    if (t.date > (lastSeen ?? ''))    lastSeen = t.date;
  }

  await supabase
    .from('players')
    .update({
      total_tournaments:  allResults?.length ?? 0,
      total_first_places: totalFirst,
      total_podiums:      totalPodiums,
      total_final_tables: totalFinals,
      last_seen:          lastSeen,
    })
    .eq('id', keep_id);

  // ── 6. Eliminar jugador fusionado ────────────────────
  await supabase.from('players').delete().eq('id', merge_id);

  return new Response(
    JSON.stringify({
      success: true,
      message: `"${mergePlayer.nickname}" fusionado en "${keepPlayer.nickname}" correctamente.`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};