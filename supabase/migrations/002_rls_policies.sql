-- supabase/migrations/002_rls_policies.sql

-- Habilitar RLS en todas las tablas
ALTER TABLE rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues           ENABLE ROW LEVEL SECURITY;
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_room_nicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE elo_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_standings  ENABLE ROW LEVEL SECURITY;

-- =============================================
-- LECTURA PÚBLICA
-- =============================================
CREATE POLICY "Lectura pública de salas"
  ON rooms FOR SELECT USING (true);

CREATE POLICY "Lectura pública de países"
  ON countries FOR SELECT USING (true);

CREATE POLICY "Lectura pública de clubes activos"
  ON clubs FOR SELECT USING (is_active = true);

CREATE POLICY "Lectura pública de ligas activas"
  ON leagues FOR SELECT USING (is_active = true);

CREATE POLICY "Lectura pública de jugadores activos"
  ON players FOR SELECT USING (is_active = true);

CREATE POLICY "Lectura pública de nicks"
  ON player_room_nicks FOR SELECT USING (true);

CREATE POLICY "Lectura pública de torneos verificados"
  ON tournaments FOR SELECT USING (is_verified = true);

CREATE POLICY "Lectura pública de resultados"
  ON tournament_results FOR SELECT USING (true);

CREATE POLICY "Lectura pública de historial ELO"
  ON elo_history FOR SELECT USING (true);

CREATE POLICY "Lectura pública de clasificaciones"
  ON league_standings FOR SELECT USING (true);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS admin_role AS $$
  SELECT role FROM admin_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_club_id()
RETURNS INTEGER AS $$
  SELECT club_id FROM admin_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================
-- POLÍTICAS DE CLUB ADMIN
-- =============================================

-- Lee torneos de su club (incluso no verificados)
CREATE POLICY "Club admin lee torneos de su club"
  ON tournaments FOR SELECT
  USING (
    club_id = get_user_club_id()
    OR is_verified = true
  );

-- Crea torneos de su club
CREATE POLICY "Club admin crea torneos de su club"
  ON tournaments FOR INSERT
  WITH CHECK (
    club_id = get_user_club_id()
    AND auth.uid() IS NOT NULL
  );

-- Edita torneos no verificados de su club
CREATE POLICY "Club admin edita torneos no verificados de su club"
  ON tournaments FOR UPDATE
  USING (
    club_id = get_user_club_id()
    AND is_verified = false
    AND auth.uid() IS NOT NULL
  );

-- Crea resultados de torneos de su club
CREATE POLICY "Club admin crea resultados"
  ON tournament_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments
      WHERE id = tournament_id
        AND club_id = get_user_club_id()
    )
    AND auth.uid() IS NOT NULL
  );

-- Cada admin ve solo su propio perfil
CREATE POLICY "Admin ve su propio perfil"
  ON admin_profiles FOR SELECT
  USING (id = auth.uid());