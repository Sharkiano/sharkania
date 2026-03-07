// src/pages/api/players/search-nicks.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();
  const body     = await request.json() as { nicknames?: string[]; room_id?: number };

  if (!body.nicknames?.length || !body.room_id) {
    return new Response(JSON.stringify({ existing: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data } = await supabase
    .from('player_room_nicks')
    .select('nickname')
    .eq('room_id', body.room_id)
    .in('nickname', body.nicknames);

  return new Response(
    JSON.stringify({ existing: data?.map(r => r.nickname) ?? [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};