// src/pages/api/admin/eliminar-torneo.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = createServerClient();

  // Verificar super_admin via middleware (locals)
  const adminProfile = locals.adminProfile as { role: string } | undefined;
  if (!adminProfile || adminProfile.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const body = await request.json();
  const { tournament_id } = body;

  if (!tournament_id || isNaN(Number(tournament_id))) {
    return new Response(JSON.stringify({ error: 'ID de torneo inválido' }), { status: 400 });
  }

  const tid = Number(tournament_id);

  // ── 1. Verificar si el torneo existe y su estado ───────────────────
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, is_verified, name')
    .eq('id', tid)
    .single();

  if (!tournament) {
    return new Response(JSON.stringify({ error: 'Torneo no encontrado' }), { status: 404 });
  }

  // ── 2. Si está verificado, revertir ELO de cada jugador ───────────
  if (tournament.is_verified) {

    // Obtener todos los resultados con elo_change de este torneo
    const { data: results, error: resultsErr } = await supabase
      .from('tournament_results')
      .select('player_id, elo_change, elo_before')
      .eq('tournament_id', tid);

    if (resultsErr || !results) {
      return new Response(
        JSON.stringify({ error: 'Error al obtener resultados para revertir ELO' }),
        { status: 500 }
      );
    }

    // Filtrar solo jugadores con cambio de ELO real
    const affectedResults = results.filter(
      r => r.elo_change !== null && r.elo_change !== 0
    );

    // Para cada jugador: restar el elo_change y actualizar stats
    const revertPromises = affectedResults.map(async (r) => {

      // Obtener datos actuales del jugador
      const { data: player } = await supabase
        .from('players')
        .select('elo_rating, peak_elo, total_tournaments')
        .eq('id', r.player_id)
        .single();

      if (!player) return;

      // Nuevo ELO = ELO actual - cambio aplicado en este torneo
      // Mínimo 800 para no bajar del piso
      const newElo = Math.max(
        800,
        (player.elo_rating ?? 1200) - (r.elo_change ?? 0)
      );

      // Peak ELO: solo reducir si el peak actual coincide con el elo_after
      // En caso de duda, dejamos el peak como está (conservador)
      const newPeak = Math.max(newElo, player.peak_elo ?? 1200);

      await supabase
        .from('players')
        .update({
          elo_rating:        newElo,
          peak_elo:          newPeak,
          total_tournaments: Math.max(0, (player.total_tournaments ?? 1) - 1),
          updated_at:        new Date().toISOString(),
        })
        .eq('id', r.player_id);
    });

    // Ejecutar todas las reversiones en paralelo
    await Promise.all(revertPromises);

    // Limpiar historial ELO de este torneo
    await supabase
      .from('elo_history')
      .delete()
      .eq('tournament_id', tid);
  }

  // ── 3. Eliminar resultados ─────────────────────────────────────────
  const { error: resultsDeleteErr } = await supabase
    .from('tournament_results')
    .delete()
    .eq('tournament_id', tid);

  if (resultsDeleteErr) {
    return new Response(
      JSON.stringify({ error: 'Error al eliminar los resultados del torneo' }),
      { status: 500 }
    );
  }

  // ── 4. Eliminar el torneo ──────────────────────────────────────────
  const { error: tournamentDeleteErr } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', tid);

  if (tournamentDeleteErr) {
    return new Response(
      JSON.stringify({ error: 'Error al eliminar el torneo' }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({
      success:      true,
      elo_reverted: tournament.is_verified,
      message:      tournament.is_verified
        ? 'Torneo eliminado y ELO de los jugadores revertido correctamente.'
        : 'Torneo eliminado correctamente.',
    }),
    { status: 200 }
  );
};