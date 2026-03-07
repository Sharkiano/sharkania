// src/env.d.ts
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    adminProfile: {
  id: string;
  role: 'super_admin' | 'club_admin';
  club_id: number | null;
  is_active: boolean | null;
} | null;
    session: import('@supabase/supabase-js').Session | null;
  }
}