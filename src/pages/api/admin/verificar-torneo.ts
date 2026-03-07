// src/pages/api/admin/verificar-torneo.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';
import { calculateTournamentElo } from '@lib/elo/calculator';

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { tournament_id?: number };

  if (!body.tournament_id) {
    return new Response(JSON.stringify({ error: 'tournament_id requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Obtener torneo ───────────────────────────────────
  const { data: tournament, error: tError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', body.tournament_id)
    .single();

  if (tError || !tournament) {
    return new Response(JSON.stringify({ error: 'Torneo no encontrado.' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (tournament.is_verified) {
    return new Response(JSON.stringify({ error: 'El torneo ya está verificado.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Obtener resultados del torneo ────────────────────
  const { data: results, error: rError } = await supabase
    .from('tournament_results')
    .select('player_id, position, players ( elo_rating, total_tournaments )')
    .eq('tournament_id', body.tournament_id);

  if (rError || !results?.length) {
    return new Response(JSON.stringify({ error: 'No hay resultados para este torneo.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Preparar datos para el calculador ───────────────
  const playerData = results.map(r => {
    const player = r.players as { elo_rating: number; total_tournaments: number } | null;
    return {
      player_id:         r.player_id,
      position:          r.position,
      current_elo:       player?.elo_rating       ?? 1200,
      total_tournaments: player?.total_tournaments ?? 0,
    };
  });

  // ── Calcular ELO ─────────────────────────────────────
  const leagueMultiplier = tournament.league_id ? 1.2 : 1.0;
  const eloResults = calculateTournamentElo(
    playerData,
    tournament.total_players,
    tournament.buy_in ?? 0,
    leagueMultiplier
  );

  // ── Aplicar cambios a cada jugador ───────────────────
  for (const result of eloResults) {
    // Actualizar ELO del jugador
    const { data: player } = await supabase
      .from('players')
      .select('peak_elo')
      .eq('id', result.player_id)
      .single();

    const newPeakElo = Math.max(player?.peak_elo ?? 1200, result.elo_after);

    await supabase
      .from('players')
      .update({
        elo_rating: result.elo_after,
        peak_elo:   newPeakElo,
      })
      .eq('id', result.player_id);

    // Actualizar elo_change en tournament_results
    await supabase
      .from('tournament_results')
      .update({
        elo_change:  result.elo_change,
        elo_before:  result.elo_before,
        elo_after:   result.elo_after,
      })
      .eq('tournament_id', body.tournament_id)
      .eq('player_id', result.player_id);

    // Insertar en elo_history
    await supabase
      .from('elo_history')
      .insert({
        player_id:     result.player_id,
        tournament_id: body.tournament_id,
        elo_before:    result.elo_before,
        elo_after:     result.elo_after,
        elo_change:    result.elo_change,
        date:          tournament.date,
      });
  }

  // ── Marcar torneo como verificado ────────────────────
  await supabase
    .from('tournaments')
    .update({ is_verified: true })
    .eq('id', body.tournament_id);

  return new Response(
    JSON.stringify({
      success:       true,
      message:       `Torneo verificado. ELO calculado para ${eloResults.length} jugadores.`,
      elo_results:   eloResults,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};