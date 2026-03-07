-- supabase/seed.sql

-- Países de habla hispana + Brasil + Portugal
INSERT INTO countries (name, code, flag_emoji) VALUES
  ('Argentina',            'AR', '🇦🇷'),
  ('Bolivia',              'BO', '🇧🇴'),
  ('Brasil',               'BR', '🇧🇷'),
  ('Chile',                'CL', '🇨🇱'),
  ('Colombia',             'CO', '🇨🇴'),
  ('Costa Rica',           'CR', '🇨🇷'),
  ('Cuba',                 'CU', '🇨🇺'),
  ('Ecuador',              'EC', '🇪🇨'),
  ('El Salvador',          'SV', '🇸🇻'),
  ('España',               'ES', '🇪🇸'),
  ('Guatemala',            'GT', '🇬🇹'),
  ('Honduras',             'HN', '🇭🇳'),
  ('México',               'MX', '🇲🇽'),
  ('Nicaragua',            'NI', '🇳🇮'),
  ('Panamá',               'PA', '🇵🇦'),
  ('Paraguay',             'PY', '🇵🇾'),
  ('Perú',                 'PE', '🇵🇪'),
  ('Portugal',             'PT', '🇵🇹'),
  ('Puerto Rico',          'PR', '🇵🇷'),
  ('República Dominicana', 'DO', '🇩🇴'),
  ('Uruguay',              'UY', '🇺🇾'),
  ('Venezuela',            'VE', '🇻🇪');

-- Salas de póker principales
INSERT INTO rooms (name, slug) VALUES
  ('GGPoker',        'ggpoker'),
  ('PokerStars',     'pokerstars'),
  ('ClubGG',         'clubgg'),
  ('PPPoker',        'pppoker'),
  ('PokerBros',      'pokerbros'),
  ('888poker',       '888poker'),
  ('partypoker',     'partypoker'),
  ('WPT Global',     'wpt-global'),
  ('ACR Poker',      'acr-poker'),
  ('Winamax',        'winamax'),
  ('Suprema Poker',  'suprema-poker'),
  ('KKPoker',        'kkpoker'),
  ('CoinPoker',      'coinpoker'),
  ('Natural8',       'natural8'),
  ('Otra',           'otra');