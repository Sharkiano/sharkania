// src/pages/api/tournaments/upload-results.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

type CurrencyType = 'USD' | 'EUR' | 'ARS' | 'CLP' | 'MXN' | 'COP' | 'PEN' | 'BRL' | 'UYU';

interface ResultRow {
  position: number;
  nickname: string;
  country_code: string;
  prize: number | null;
  reentries: number;
  bounties: number;
}

interface UploadPayload {
  tournament: {
    name: string;
    date: string;
    room_id: number;
    league_id: number | null;
    buy_in: number | null;
    currency: string;
    total_players: number;
    notes: string;
  };
  results: ResultRow[];
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createServerClient();

  // ── Verificar sesión desde cookies ──────────────────
  const accessToken  = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: { user } } = await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });

  if (!user) {
    return new Response(JSON.stringify({ error: 'Sesión inválida.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('id, club_id, role, is_active')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.club_id || !adminProfile.is_active) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as UploadPayload;
  const { tournament, results } = body;

  // ── Validaciones básicas ─────────────────────────────
  if (!tournament.name || !tournament.date || !tournament.room_id || !results?.length) {
    return new Response(
      JSON.stringify({ error: 'Datos del torneo o resultados incompletos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const currency = (tournament.currency || 'USD') as CurrencyType;

  // ── Verificar que la liga pertenece al club ──────────
  if (tournament.league_id) {
    const { data: league } = await supabase
      .from('leagues')
      .select('club_id')
      .eq('id', tournament.league_id)
      .single();

    if (!league || league.club_id !== adminProfile.club_id) {
      return new Response(
        JSON.stringify({ error: 'La liga no pertenece a tu club.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ── Obtener países para validar códigos ──────────────
  const { data: countries } = await supabase
    .from('countries')
    .select('id, code');

  const countryMap = new Map(countries?.map(c => [c.code.toUpperCase(), c.id]) ?? []);

  // ── Procesar cada jugador ────────────────────────────
  const playerIds: number[] = [];

  for (const row of results) {
    const nickname    = row.nickname.trim();
    const countryCode = row.country_code?.toUpperCase().trim() ?? '';
    const countryId   = countryMap.get(countryCode) ?? null;

    // Buscar jugador existente por nick + sala
    const { data: existingNick } = await supabase
      .from('player_room_nicks')
      .select('player_id')
      .eq('room_id', tournament.room_id)
      .ilike('nickname', nickname)
      .single();

    if (existingNick) {
      playerIds.push(existingNick.player_id);
      continue;
    }

    // Crear jugador nuevo
    const slug = nickname
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      + '-' + Date.now().toString(36);

    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({
        nickname,
        slug,
        country_id: countryId,
        elo_rating:  1200,
        peak_elo:    1200,
        first_seen:  tournament.date,
        last_seen:   tournament.date,
        is_active:   true,
      })
      .select('id')
      .single();

    if (playerError || !newPlayer) {
      return new Response(
        JSON.stringify({ error: `Error creando jugador "${nickname}": ${playerError?.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Crear nick en player_room_nicks
    await supabase
      .from('player_room_nicks')
      .insert({
        player_id: newPlayer.id,
        room_id:   tournament.room_id,
        nickname,
      });

    playerIds.push(newPlayer.id);
  }

  // ── Crear torneo ─────────────────────────────────────
  const { data: newTournament, error: tournamentError } = await supabase
    .from('tournaments')
    .insert({
      name:          tournament.name,
      club_id:       adminProfile.club_id,
      league_id:     tournament.league_id,
      room_id:       tournament.room_id,
      date:          tournament.date,
      total_players: tournament.total_players,
      buy_in:        tournament.buy_in,
      currency,
      notes:         tournament.notes || null,
      uploaded_by:   adminProfile.id,
      is_verified:   false,
    })
    .select('id')
    .single();

  if (tournamentError || !newTournament) {
    return new Response(
      JSON.stringify({ error: `Error creando torneo: ${tournamentError?.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Crear resultados ─────────────────────────────────
  const tournamentResults = results.map((row, index) => ({
    tournament_id: newTournament.id,
    player_id:     playerIds[index],
    position:      row.position,
    prize:         row.prize,
    currency,
    reentries:     row.reentries || 0,
    bounties:      row.bounties  || 0,
    elo_change:    0,
    league_points: 0,
  }));

  const { error: resultsError } = await supabase
    .from('tournament_results')
    .insert(tournamentResults);

  if (resultsError) {
    // Rollback torneo
    await supabase.from('tournaments').delete().eq('id', newTournament.id);
    return new Response(
      JSON.stringify({ error: `Error guardando resultados: ${resultsError.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Actualizar stats de jugadores ────────────────────
  for (let i = 0; i < results.length; i++) {
    const playerId = playerIds[i];
    const position = results[i].position;

    const { data: player } = await supabase
      .from('players')
      .select('total_tournaments, total_first_places, total_podiums, total_final_tables')
      .eq('id', playerId)
      .single();

    if (!player) continue;

    const finalTableThreshold = Math.max(1, Math.ceil(tournament.total_players * 0.1));

    await supabase
      .from('players')
      .update({
        total_tournaments:  (player.total_tournaments  ?? 0) + 1,
        total_first_places: (player.total_first_places ?? 0) + (position === 1 ? 1 : 0),
        total_podiums:      (player.total_podiums       ?? 0) + (position <= 3 ? 1 : 0),
        total_final_tables: (player.total_final_tables  ?? 0) + (position <= finalTableThreshold ? 1 : 0),
        last_seen:          tournament.date,
      })
      .eq('id', playerId);
  }

  // ── Actualizar league_standings si aplica ────────────
  if (tournament.league_id) {
    const { data: leagueData } = await supabase
      .from('leagues')
      .select('scoring_system')
      .eq('id', tournament.league_id)
      .single();

    const scoring = leagueData?.scoring_system as {
      points?: Record<string, number>;
      participationPoints?: number;
      bonusBountyPoints?: number;
    } | null;

    for (let i = 0; i < results.length; i++) {
      const playerId     = playerIds[i];
      const position     = results[i].position;
      const bounties     = results[i].bounties || 0;
      const posPoints    = scoring?.points?.[String(position)] ?? 0;
      const partPoints   = scoring?.participationPoints        ?? 0;
      const bountyPoints = (scoring?.bonusBountyPoints ?? 0) * bounties;
      const totalPoints  = posPoints + partPoints + bountyPoints;

      const { data: existing } = await supabase
        .from('league_standings')
        .select('*')
        .eq('league_id', tournament.league_id)
        .eq('player_id', playerId)
        .single();

      if (existing) {
        const newTotal  = (existing.total_points       ?? 0) + totalPoints;
        const newPlayed = (existing.tournaments_played ?? 0) + 1;
        const newBest   = Math.min(existing.best_position ?? 999, position);
        const newAvg    = ((existing.average_position ?? position) * (newPlayed - 1) + position) / newPlayed;

        await supabase
          .from('league_standings')
          .update({
            total_points:       newTotal,
            tournaments_played: newPlayed,
            best_position:      newBest,
            average_position:   Math.round(newAvg * 10) / 10,
            updated_at:         new Date().toISOString(),
          })
          .eq('league_id', tournament.league_id)
          .eq('player_id', playerId);
      } else {
        await supabase
          .from('league_standings')
          .insert({
            league_id:          tournament.league_id,
            player_id:          playerId,
            total_points:       totalPoints,
            tournaments_played: 1,
            best_position:      position,
            average_position:   position,
          });
      }
    }
  }

  return new Response(
    JSON.stringify({
      success:       true,
      tournament_id: newTournament.id,
      total_players: results.length,
      message:       `Torneo cargado exitosamente con ${results.length} jugadores.`,
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};