// src/lib/supabase/client.ts
// Cliente PÚBLICO — usa anon key — respeta RLS
// Usar en: componentes del frontend, islands, llamadas desde el navegador

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl  = import.meta.env.PUBLIC_SUPABASE_URL as string;
const supabaseAnon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Faltan variables de entorno: PUBLIC_SUPABASE_URL y/o PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});