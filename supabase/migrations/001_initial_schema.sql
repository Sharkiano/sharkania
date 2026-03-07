-- supabase/migrations/001_initial_schema.sql
-- ============================================
-- Extensiones
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM types
-- ============================================
CREATE TYPE admin_role AS ENUM ('super_admin', 'club_admin');
CREATE TYPE currency_type AS ENUM ('USD', 'EUR', 'ARS', 'CLP', 'MXN', 'COP', 'PEN', 'BRL', 'UYU');

-- ============================================
-- TABLA: rooms (Salas de póker online)
-- ============================================
CREATE TABLE rooms (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  slug       TEXT    NOT NULL UNIQUE,
  logo_url   TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: countries (Países)
-- ============================================
CREATE TABLE countries (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE, -- ISO 3166-1 alpha-2: "AR", "CL", "MX"
  flag_emoji TEXT                  -- "🇦🇷", "🇨🇱", "🇲🇽"
);

-- ============================================
-- TABLA: clubs (Clubes de póker)
-- ============================================
CREATE TABLE clubs (
  id           SERIAL PRIMARY KEY,
  name         TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE,
  description  TEXT,
  country_id   INTEGER REFERENCES countries(id),
  room_id      INTEGER REFERENCES rooms(id),
  logo_url     TEXT,
  contact_info JSONB   DEFAULT '{}', -- {telegram, whatsapp, instagram}
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: leagues (Ligas — un club puede tener varias)
-- ============================================
CREATE TABLE leagues (
  id             SERIAL PRIMARY KEY,
  name           TEXT    NOT NULL,
  slug           TEXT    NOT NULL UNIQUE,
  club_id        INTEGER REFERENCES clubs(id) NOT NULL,
  description    TEXT,
  scoring_system JSONB,   -- Reglas de puntaje personalizadas
  season_start   DATE,
  season_end     DATE,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: players (Jugadores)
-- Se crean automáticamente al subir resultados
-- ============================================
CREATE TABLE players (
  id                   SERIAL PRIMARY KEY,
  nickname             TEXT    NOT NULL,
  slug                 TEXT    NOT NULL UNIQUE,
  country_id           INTEGER REFERENCES countries(id),
  avatar_url           TEXT,
  -- ELO Global
  elo_rating           INTEGER DEFAULT 1200,
  peak_elo             INTEGER DEFAULT 1200,
  total_tournaments    INTEGER DEFAULT 0,
  total_first_places   INTEGER DEFAULT 0,
  total_podiums        INTEGER DEFAULT 0, -- Top 3
  total_final_tables   INTEGER DEFAULT 0, -- Top ~10%
  -- Metadata
  first_seen           DATE,
  last_seen            DATE,
  is_active            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: player_room_nicks
-- Un jugador puede tener distintos nicks en distintas salas
-- ============================================
CREATE TABLE player_room_nicks (
  id        SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  room_id   INTEGER REFERENCES rooms(id) NOT NULL,
  nickname  TEXT NOT NULL,
  UNIQUE(room_id, nickname) -- Un nick es único por sala
);

-- ============================================
-- TABLA: admin_profiles
-- Extiende Supabase Auth con datos de rol y club
-- ============================================
CREATE TABLE admin_profiles (
  id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  role       admin_role NOT NULL DEFAULT 'club_admin',
  club_id    INTEGER REFERENCES clubs(id), -- NULL si es super_admin
  is_active  BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: tournaments (Torneos individuales)
-- ============================================
CREATE TABLE tournaments (
  id                SERIAL PRIMARY KEY,
  name              TEXT    NOT NULL,
  club_id           INTEGER REFERENCES clubs(id) NOT NULL,
  league_id         INTEGER REFERENCES leagues(id), -- Puede no pertenecer a liga
  room_id           INTEGER REFERENCES rooms(id) NOT NULL,
  -- Datos del torneo
  date              DATE    NOT NULL,
  total_players     INTEGER NOT NULL,
  total_entries     INTEGER,           -- Entries con reentries
  buy_in            DECIMAL(10,2),
  currency          currency_type DEFAULT 'USD',
  prize_pool        DECIMAL(12,2),
  -- Peso para el ELO
  tournament_weight DECIMAL(4,2) DEFAULT 1.0,
  -- Metadata
  uploaded_by       UUID REFERENCES admin_profiles(id),
  is_verified       BOOLEAN DEFAULT false,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: tournament_results
-- Resultados de cada jugador en cada torneo
-- ============================================
CREATE TABLE tournament_results (
  id            SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  player_id     INTEGER REFERENCES players(id) NOT NULL,
  position      INTEGER NOT NULL,
  prize         DECIMAL(10,2),
  currency      currency_type DEFAULT 'USD',
  reentries     INTEGER DEFAULT 0,
  bounties      INTEGER DEFAULT 0,
  -- ELO
  elo_change    DECIMAL(6,1) DEFAULT 0,
  elo_before    INTEGER,
  elo_after     INTEGER,
  -- Puntos de liga
  league_points DECIMAL(8,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, player_id),
  UNIQUE(tournament_id, position)
);

-- ============================================
-- TABLA: elo_history
-- Historial de cambios ELO para gráficos
-- ============================================
CREATE TABLE elo_history (
  id            SERIAL PRIMARY KEY,
  player_id     INTEGER REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  elo_before    INTEGER     NOT NULL,
  elo_after     INTEGER     NOT NULL,
  elo_change    DECIMAL(6,1) NOT NULL,
  date          DATE        NOT NULL
);

-- ============================================
-- TABLA: league_standings
-- Clasificación acumulada por liga
-- ============================================
CREATE TABLE league_standings (
  id                 SERIAL PRIMARY KEY,
  league_id          INTEGER REFERENCES leagues(id) ON DELETE CASCADE NOT NULL,
  player_id          INTEGER REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  total_points       DECIMAL(10,2) DEFAULT 0,
  tournaments_played INTEGER DEFAULT 0,
  best_position      INTEGER,
  average_position   DECIMAL(5,1),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id)
);

-- ============================================
-- ÍNDICES para consultas frecuentes
-- ============================================
CREATE INDEX idx_players_elo             ON players(elo_rating DESC);
CREATE INDEX idx_players_slug            ON players(slug);
CREATE INDEX idx_players_nickname        ON players(nickname);
CREATE INDEX idx_tournaments_club        ON tournaments(club_id);
CREATE INDEX idx_tournaments_league      ON tournaments(league_id);
CREATE INDEX idx_tournaments_date        ON tournaments(date DESC);
CREATE INDEX idx_results_tournament      ON tournament_results(tournament_id);
CREATE INDEX idx_results_player          ON tournament_results(player_id);
CREATE INDEX idx_elo_history_player      ON elo_history(player_id, date);
CREATE INDEX idx_league_standings_league ON league_standings(league_id, total_points DESC);
CREATE INDEX idx_player_room_nicks_lookup ON player_room_nicks(room_id, nickname);
CREATE INDEX idx_clubs_slug              ON clubs(slug);
CREATE INDEX idx_leagues_slug            ON leagues(slug);
CREATE INDEX idx_leagues_club            ON leagues(club_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();