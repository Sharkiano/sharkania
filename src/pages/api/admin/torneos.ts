// src/pages/api/admin/torneos.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const supabase = createServerClient();

  const accessToken  = cookies.get('sb-access-token')?.value;
  const refreshToken = cookies.get('sb-refresh-token')?.value;

  if (!accessToken || !refreshToken) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: { user } } = await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });

  if (!user) {
    return new Response(JSON.stringify({ error: 'Sesión inválida.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('club_id, role')
    .eq('id', user.id)
    .single();

  if (!adminProfile) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as { id?: number };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar que el torneo pertenece al club y no está verificado
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('club_id, is_verified')
    .eq('id', body.id)
    .single();

  if (!tournament) {
    return new Response(JSON.stringify({ error: 'Torneo no encontrado.' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Club admin solo puede eliminar torneos de su club no verificados
  if (adminProfile.role === 'club_admin') {
    if (tournament.club_id !== adminProfile.club_id) {
      return new Response(JSON.stringify({ error: 'No tenés permiso para eliminar este torneo.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (tournament.is_verified) {
      return new Response(JSON.stringify({ error: 'No se puede eliminar un torneo ya verificado.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Eliminar resultados primero (CASCADE debería hacerlo pero por las dudas)
  await supabase.from('tournament_results').delete().eq('tournament_id', body.id);
  await supabase.from('elo_history').delete().eq('tournament_id', body.id);

  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', body.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};