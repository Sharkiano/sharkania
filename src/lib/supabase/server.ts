// src/lib/supabase/server.ts
// Cliente SERVIDOR — usa service_role key — BYPASEA RLS completamente
// Usar SOLO en: API endpoints (.ts), middleware, server-side de .astro pages
// ⚠️  NUNCA importar en código que corra en el navegador

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl         = import.meta.env.SUPABASE_URL as string;
const supabaseServiceRole = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceRole) {
  throw new Error(
    'Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'
  );
}

export function createServerClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}