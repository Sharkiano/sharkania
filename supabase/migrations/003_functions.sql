-- supabase/migrations/003_functions.sql

-- =============================================
-- Buscar jugador por nick y sala
-- =============================================
CREATE OR REPLACE FUNCTION find_player_by_nick_and_room(
  p_nickname TEXT,
  p_room_id  INTEGER
)
RETURNS INTEGER AS $$
  SELECT prn.player_id
  FROM player_room_nicks prn
  WHERE prn.room_id = p_room_id
    AND LOWER(prn.nickname) = LOWER(p_nickname)
  LIMIT 1;
$$ LANGUAGE sql;

-- =============================================
-- Ranking global paginado
-- =============================================
CREATE OR REPLACE FUNCTION get_global_ranking(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  rank              BIGINT,
  player_id         INTEGER,
  nickname          TEXT,
  slug              TEXT,
  country_code      TEXT,
  country_flag      TEXT,
  elo_rating        INTEGER,
  peak_elo          INTEGER,
  total_tournaments INTEGER,
  total_podiums     INTEGER
) AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC) AS rank,
    p.id            AS player_id,
    p.nickname,
    p.slug,
    c.code          AS country_code,
    c.flag_emoji    AS country_flag,
    p.elo_rating,
    p.peak_elo,
    p.total_tournaments,
    p.total_podiums
  FROM players p
  LEFT JOIN countries c ON p.country_id = c.id
  WHERE p.is_active = true
    AND p.total_tournaments > 0
  ORDER BY p.elo_rating DESC
  LIMIT p_limit OFFSET p_offset;
$$ LANGUAGE sql;

-- =============================================
-- Estadísticas completas de un jugador
-- =============================================
CREATE OR REPLACE FUNCTION get_player_stats(p_player_slug TEXT)
RETURNS TABLE (
  player_id          INTEGER,
  nickname           TEXT,
  country_name       TEXT,
  country_flag       TEXT,
  elo_rating         INTEGER,
  peak_elo           INTEGER,
  total_tournaments  INTEGER,
  total_first_places INTEGER,
  total_podiums      INTEGER,
  total_final_tables INTEGER,
  best_position      INTEGER,
  avg_position       DECIMAL,
  clubs_played_in    BIGINT,
  first_seen         DATE,
  last_seen          DATE
) AS $$
  SELECT
    p.id,
    p.nickname,
    c.name          AS country_name,
    c.flag_emoji    AS country_flag,
    p.elo_rating,
    p.peak_elo,
    p.total_tournaments,
    p.total_first_places,
    p.total_podiums,
    p.total_final_tables,
    MIN(tr.position)         AS best_position,
    ROUND(AVG(tr.position), 1) AS avg_position,
    COUNT(DISTINCT t.club_id)  AS clubs_played_in,
    p.first_seen,
    p.last_seen
  FROM players p
  LEFT JOIN countries c             ON p.country_id = c.id
  LEFT JOIN tournament_results tr   ON p.id = tr.player_id
  LEFT JOIN tournaments t           ON tr.tournament_id = t.id
  WHERE p.slug = p_player_slug
  GROUP BY p.id, c.name, c.flag_emoji;
$$ LANGUAGE sql;