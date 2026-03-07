// src/pages/api/admin/recalcular-elo.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';
import { calculateEloChange } from '@lib/elo/calculator';

// ── Tipos internos ────────────────────────────────────────────
interface ScoringSystem {
  type:                string;
  points:              Record<string, number>;
  participationPoints?: number;
  bonusBountyPoints?:  number;
  bestNof?:            number | null;
}

interface PlayerState {
  id:                 number;
  elo_rating:         number;
  peak_elo:           number;
  total_tournaments:  number;
  total_first_places: number;
  total_podiums:      number;
  total_final_tables: number;
  first_seen:         string | null;
  last_seen:          string | null;
}

// ── Calcular puntos de liga según posición ────────────────────
function calcLeaguePoints(
  scoring: ScoringSystem,
  position: number,
  bounties: number
): number {
  const posPoints   = scoring.points[String(position)] ?? 0;
  // Participación solo si no cobra puntos por posición
  const partPoints  = posPoints === 0 ? (scoring.participationPoints ?? 0) : 0;
  const bountyBonus = bounties * (scoring.bonusBountyPoints ?? 0);
  return posPoints + partPoints + bountyBonus;
}

export const POST: APIRoute = async ({ locals }) => {
  const supabase = createServerClient();

  // ── Verificar super_admin ─────────────────────────────────
  const adminProfile = locals.adminProfile as { role: string } | undefined;
  if (!adminProfile || adminProfile.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
  }

  try {
    // ════════════════════════════════════════════════════════
    // PASO 1: Resetear stats de todos los jugadores activos
    // ════════════════════════════════════════════════════════
    const { error: resetErr } = await supabase
      .from('players')
      .update({
        elo_rating:         1200,
        peak_elo:           1200,
        total_tournaments:  0,
        total_first_places: 0,
        total_podiums:      0,
        total_final_tables: 0,
        first_seen:         null,
        last_seen:          null,
      })
      .eq('is_active', true);
    if (resetErr) throw new Error(`Reset players: ${resetErr.message}`);

    // ════════════════════════════════════════════════════════
    // PASO 2: Limpiar tablas derivadas
    // ════════════════════════════════════════════════════════
    const { error: e1 } = await supabase.from('elo_history').delete().neq('id', 0);
    if (e1) throw new Error(`Clear elo_history: ${e1.message}`);

    const { error: e2 } = await supabase
      .from('tournament_results')
      .update({ league_points: 0 })
      .neq('id', 0);
    if (e2) throw new Error(`Reset league_points: ${e2.message}`);

    const { error: e3 } = await supabase.from('league_standings').delete().neq('id', 0);
    if (e3) throw new Error(`Clear league_standings: ${e3.message}`);

    // ════════════════════════════════════════════════════════
    // PASO 3: Cargar datos base en memoria
    // ════════════════════════════════════════════════════════

    // Torneos verificados cronológicamente
    const { data: tournaments, error: tErr } = await supabase
      .from('tournaments')
      .select('id, date, total_players, buy_in, league_id, tournament_weight, table_size')
      .eq('is_verified', true)
      .order('date', { ascending: true })
      .order('id',   { ascending: true });

    if (tErr) throw new Error(`Fetch tournaments: ${tErr.message}`);
    if (!tournaments || tournaments.length === 0) {
      return new Response(JSON.stringify({
        success: true, players_updated: 0, tournaments_processed: 0,
        message: 'No hay torneos verificados para procesar.',
      }));
    }

    // Scoring systems de ligas
    const leagueIds = [...new Set(
      tournaments.map(t => t.league_id).filter((id): id is number => id !== null)
    )];
    const leagueScoring = new Map<number, ScoringSystem>();

    if (leagueIds.length > 0) {
      const { data: leagues } = await supabase
        .from('leagues')
        .select('id, scoring_system')
        .in('id', leagueIds);
      for (const lg of leagues ?? []) {
        if (lg.scoring_system) {
          leagueScoring.set(lg.id, lg.scoring_system as unknown as ScoringSystem);
        }
      }
    }

    // Todos los jugadores activos en memoria
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, elo_rating, peak_elo, total_tournaments, total_first_places, total_podiums, total_final_tables, first_seen, last_seen')
      .eq('is_active', true);

    const playerMap = new Map<number, PlayerState>(
      (allPlayers ?? []).map(p => [p.id, {
        id:                 p.id,
        elo_rating:         p.elo_rating         ?? 1200,
        peak_elo:           p.peak_elo           ?? 1200,
        total_tournaments:  p.total_tournaments  ?? 0,
        total_first_places: p.total_first_places ?? 0,
        total_podiums:      p.total_podiums      ?? 0,
        total_final_tables: p.total_final_tables ?? 0,
        first_seen:         p.first_seen,
        last_seen:          p.last_seen,
      }])
    );

    // ════════════════════════════════════════════════════════
    // PASO 4: Procesar torneos — todo en memoria
    // ════════════════════════════════════════════════════════
    type ResultUpdate = {
      id: number; elo_before: number; elo_after: number;
      elo_change: number; league_points: number;
    };
    type EloHistoryRow = { player_id: number; tournament_id: number; elo_before: number; elo_after: number; elo_change: number; date: string; };
    const allEloHistory:  EloHistoryRow[] = [];
    const resultUpdates:  ResultUpdate[]  = [];

    // Acumulador de standings: leagueId → playerId → stats
    const standingsAcc = new Map<number, Map<number, {
      total_points: number; tournaments_played: number;
      best_position: number | null; positions_sum: number;
    }>>();

    let tournamentsProcessed = 0;

    for (const tournament of tournaments) {
      const { data: results, error: rErr } = await supabase
        .from('tournament_results')
        .select('id, player_id, position, bounties')
        .eq('tournament_id', tournament.id)
        .order('position', { ascending: true });

      if (rErr || !results || results.length === 0) continue;

      const validResults = results.filter(r => playerMap.has(r.player_id));
      if (validResults.length === 0) continue;

      const totalPlayers     = tournament.total_players ?? validResults.length;
      const buyIn            = tournament.buy_in ?? 0;
      const leagueMultiplier = tournament.league_id ? 1.2 : 1.0;
      const finalTableCutoff = tournament.table_size ?? 9;
      const scoring          = tournament.league_id ? leagueScoring.get(tournament.league_id) : undefined;

      // Rating promedio del torneo (snapshot antes de procesar)
      const avgRating = validResults.reduce(
        (sum, r) => sum + (playerMap.get(r.player_id)!.elo_rating), 0
      ) / validResults.length;

      for (const result of validResults) {
        const player    = playerMap.get(result.player_id)!;
        const eloBefore = player.elo_rating;

        // ELO
        const change = calculateEloChange({
          playerRating:           eloBefore,
          avgOpponentRating:      avgRating,
          position:               result.position,
          totalPlayers,
          totalTournamentsPlayed: player.total_tournaments,
          buyIn,
          leagueMultiplier,
        });
        const eloAfter = Math.max(800, Math.round(eloBefore + change));

        // Liga points
        const leaguePoints = scoring
          ? calcLeaguePoints(scoring, result.position, result.bounties ?? 0)
          : 0;

        // Acumular para batch write
        resultUpdates.push({ id: result.id, elo_before: eloBefore, elo_after: eloAfter, elo_change: change, league_points: leaguePoints });
        allEloHistory.push({ player_id: result.player_id, tournament_id: tournament.id, elo_before: eloBefore, elo_after: eloAfter, elo_change: change, date: tournament.date });

        // Actualizar jugador en memoria
        player.elo_rating         = eloAfter;
        player.peak_elo           = Math.max(player.peak_elo, eloAfter);
        player.total_tournaments  += 1;
        player.total_first_places += result.position === 1 ? 1 : 0;
        player.total_podiums      += result.position <= 3  ? 1 : 0;
        player.total_final_tables += result.position <= finalTableCutoff ? 1 : 0;
        if (!player.first_seen || tournament.date < player.first_seen) player.first_seen = tournament.date;
        if (!player.last_seen  || tournament.date > player.last_seen)  player.last_seen  = tournament.date;

        // Acumular standings de liga
        if (tournament.league_id) {
          if (!standingsAcc.has(tournament.league_id)) standingsAcc.set(tournament.league_id, new Map());
          const lgMap = standingsAcc.get(tournament.league_id)!;
          const s     = lgMap.get(result.player_id);
          if (s) {
            s.total_points       += leaguePoints;
            s.tournaments_played += 1;
            s.positions_sum      += result.position;
            if (s.best_position === null || result.position < s.best_position) s.best_position = result.position;
          } else {
            lgMap.set(result.player_id, { total_points: leaguePoints, tournaments_played: 1, best_position: result.position, positions_sum: result.position });
          }
        }
      }

      tournamentsProcessed++;
    }

    // ════════════════════════════════════════════════════════
    // PASO 5: Batch writes en paralelo por lotes
    // ════════════════════════════════════════════════════════
    const BATCH = 50;

    // 5a. tournament_results
    for (let i = 0; i < resultUpdates.length; i += BATCH) {
      await Promise.all(
        resultUpdates.slice(i, i + BATCH).map(ru =>
          supabase.from('tournament_results').update({
            elo_before: ru.elo_before, elo_after: ru.elo_after,
            elo_change: ru.elo_change, league_points: ru.league_points,
          }).eq('id', ru.id)
        )
      );
    }

    // 5b. elo_history
    for (let i = 0; i < allEloHistory.length; i += 100) {
      await supabase.from('elo_history').insert(allEloHistory.slice(i, i + 100));
    }

    // 5c. players
    const playerUpdates = [...playerMap.values()];
    for (let i = 0; i < playerUpdates.length; i += BATCH) {
      await Promise.all(
        playerUpdates.slice(i, i + BATCH).map(p =>
          supabase.from('players').update({
            elo_rating:         p.elo_rating,
            peak_elo:           p.peak_elo,
            total_tournaments:  p.total_tournaments,
            total_first_places: p.total_first_places,
            total_podiums:      p.total_podiums,
            total_final_tables: p.total_final_tables,
            first_seen:         p.first_seen,
            last_seen:          p.last_seen,
          }).eq('id', p.id)
        )
      );
    }

    // 5d. league_standings
    type StandingsRow = { league_id: number; player_id: number; total_points: number; tournaments_played: number; best_position: number | null; average_position: number; updated_at: string; };
    const standingsRows: StandingsRow[] = [];
    for (const [leagueId, lgMap] of standingsAcc.entries()) {
      for (const [playerId, s] of lgMap.entries()) {
        standingsRows.push({
          league_id:          leagueId,
          player_id:          playerId,
          total_points:       s.total_points,
          tournaments_played: s.tournaments_played,
          best_position:      s.best_position ?? null,
          average_position:   parseFloat((s.positions_sum / s.tournaments_played).toFixed(1)),
          updated_at:         new Date().toISOString(),
        });
      }
    }

    for (let i = 0; i < standingsRows.length; i += 100) {
      const { error: sErr } = await supabase
        .from('league_standings')
        .upsert(standingsRows.slice(i, i + 100), { onConflict: 'league_id,player_id' });
      if (sErr) throw new Error(`Upsert standings: ${sErr.message}`);
    }

    // ════════════════════════════════════════════════════════
    // PASO 6: Respuesta
    // ════════════════════════════════════════════════════════
    const playersUpdated = playerUpdates.filter(p => p.total_tournaments > 0).length;

    return new Response(JSON.stringify({
      success:               true,
      players_updated:       playersUpdated,
      tournaments_processed: tournamentsProcessed,
      standings_updated:     standingsRows.length,
      message:               `✓ ${tournamentsProcessed} torneos · ${playersUpdated} jugadores · ${standingsRows.length} clasificaciones de liga`,
    }), { status: 200 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[recalcular-elo]', message);
    return new Response(JSON.stringify({ success: false, error: message }), { status: 500 });
  }
};