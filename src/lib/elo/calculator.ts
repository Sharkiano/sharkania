// src/lib/elo/calculator.ts

export const ELO_CONFIG = {
  INITIAL_RATING:    1200,
  MIN_RATING:        800,
  K_NEW:             60,  // < 30 torneos
  K_STANDARD:        32,  // 30-100 torneos
  K_VETERAN:         20,  // > 100 torneos
  PROVISIONAL_GAMES: 30,
};

// ── Rendimiento real por posición ────────────────────────
// Posición 1 de 100 = 0.99, Posición 50 de 100 = 0.50
export function calculatePerformance(position: number, totalPlayers: number): number {
  if (totalPlayers <= 1) return 1;
  return 1 - ((position - 1) / (totalPlayers - 1));
}

// ── Rendimiento esperado (fórmula ELO clásica) ───────────
export function calculateExpectedPerformance(
  playerRating: number,
  avgOpponentRating: number
): number {
  return 1 / (1 + Math.pow(10, (avgOpponentRating - playerRating) / 400));
}

// ── Factor K dinámico ────────────────────────────────────
export function calculateKFactor(totalTournaments: number): number {
  if (totalTournaments < 30)  return ELO_CONFIG.K_NEW;
  if (totalTournaments < 100) return ELO_CONFIG.K_STANDARD;
  return ELO_CONFIG.K_VETERAN;
}

// ── Peso del torneo ──────────────────────────────────────
export function calculateTournamentWeight(
  totalPlayers:      number,
  buyIn:             number = 0,
  leagueMultiplier:  number = 1.0
): number {
  // Base logarítmica: 10 jugadores ≈ 1.0, 100 ≈ 2.0, 500 ≈ 2.7
  const playerWeight = Math.log10(Math.max(totalPlayers, 2)) / Math.log10(10);

  let buyInBonus = 1.0;
  if      (buyIn >= 100) buyInBonus = 1.3;
  else if (buyIn >= 50)  buyInBonus = 1.2;
  else if (buyIn >= 20)  buyInBonus = 1.1;

  return playerWeight * buyInBonus * leagueMultiplier;
}

// ── Cálculo principal del cambio de ELO ─────────────────
export function calculateEloChange(params: {
  playerRating:          number;
  avgOpponentRating:     number;
  position:              number;
  totalPlayers:          number;
  totalTournamentsPlayed: number;
  buyIn?:                number;
  leagueMultiplier?:     number;
}): number {
  const {
    playerRating,
    avgOpponentRating,
    position,
    totalPlayers,
    totalTournamentsPlayed,
    buyIn            = 0,
    leagueMultiplier = 1.0,
  } = params;

  const actualPerformance   = calculatePerformance(position, totalPlayers);
  const expectedPerformance = calculateExpectedPerformance(playerRating, avgOpponentRating);
  const kFactor             = calculateKFactor(totalTournamentsPlayed);
  const weight              = calculateTournamentWeight(totalPlayers, buyIn, leagueMultiplier);

  const eloChange = kFactor * weight * (actualPerformance - expectedPerformance);

  return Math.round(eloChange * 10) / 10;
}

// ── Decay por inactividad (ejecutar mensualmente) ────────
export function calculateInactivityDecay(
  currentRating:           number,
  daysSinceLastTournament: number
): number {
  if (daysSinceLastTournament < 60) return 0;

  const monthsInactive  = Math.floor((daysSinceLastTournament - 60) / 30);
  const decayPerMonth   = 0.02;
  const maxDecayMonths  = 6;
  const effectiveMonths = Math.min(monthsInactive, maxDecayMonths);
  const totalDecay      = effectiveMonths * decayPerMonth;
  const difference      = currentRating - ELO_CONFIG.INITIAL_RATING;

  return -(difference * totalDecay);
}

// ── Categoría ELO para UI ────────────────────────────────
export function getEloCategory(elo: number): {
  label: string;
  badge: string;
  color: string;
} {
  if (elo >= 1800) return { label: 'Leyenda',   badge: '🏆', color: '#f5af19' };
  if (elo >= 1600) return { label: 'Master',    badge: '⭐', color: '#a855f7' };
  if (elo >= 1400) return { label: 'Diamante',  badge: '🔷', color: '#448aff' };
  if (elo >= 1300) return { label: 'Oro',       badge: '🥇', color: '#ffd740' };
  if (elo >= 1200) return { label: 'Plata',     badge: '🥈', color: '#bdbdbd' };
  if (elo >= 1100) return { label: 'Bronce',    badge: '🥉', color: '#a1887f' };
  return             { label: 'Aspirante',  badge: '📍', color: '#55556a' };
}

// ── Calcular ELO para todos los jugadores de un torneo ───
export interface TournamentPlayerData {
  player_id:          number;
  position:           number;
  current_elo:        number;
  total_tournaments:  number;
}

export interface EloResult {
  player_id:   number;
  elo_before:  number;
  elo_after:   number;
  elo_change:  number;
}

export function calculateTournamentElo(
  players:          TournamentPlayerData[],
  totalPlayers:     number,
  buyIn:            number = 0,
  leagueMultiplier: number = 1.0
): EloResult[] {
  if (players.length === 0) return [];

  // Rating promedio de todos los participantes
  const avgRating = players.reduce((sum, p) => sum + p.current_elo, 0) / players.length;

  return players.map(player => {
    const eloChange = calculateEloChange({
      playerRating:           player.current_elo,
      avgOpponentRating:      avgRating,
      position:               player.position,
      totalPlayers,
      totalTournamentsPlayed: player.total_tournaments,
      buyIn,
      leagueMultiplier,
    });

    const newElo = Math.max(
      ELO_CONFIG.MIN_RATING,
      Math.round(player.current_elo + eloChange)
    );

    return {
      player_id:  player.player_id,
      elo_before: player.current_elo,
      elo_after:  newElo,
      elo_change: eloChange,
    };
  });
}