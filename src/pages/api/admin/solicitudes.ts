// src/pages/api/admin/solicitudes.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

// POST — Aprobar solicitud y crear club
export const POST: APIRoute = async ({ request, locals }) => {
  const adminProfile = locals.adminProfile;
  if (adminProfile?.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServerClient();

  const body = await request.json() as {
    id?:          number;
    club_name?:   string;
    country_id?:  number;
    room_name?:   string;
    description?: string;
    email?:       string;
    whatsapp?:    string;
  };

  if (!body.id || !body.club_name || !body.country_id || !body.room_name) {
    return new Response(JSON.stringify({ error: 'Datos incompletos.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. Buscar o crear sala
  let roomId: number | null = null;
  const { data: existingRoom } = await supabase
    .from('rooms')
    .select('id')
    .ilike('name', body.room_name)
    .single();

  if (existingRoom) {
    roomId = existingRoom.id;
  } else {
    const { data: newRoom } = await supabase
      .from('rooms')
      .insert({ name: body.room_name, is_active: true })
      .select('id')
      .single();
    roomId = newRoom?.id ?? null;
  }

  // 2. Generar slug del club
  const slug = body.club_name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // 3. Crear el club
  const { data: newClub, error: clubError } = await supabase
    .from('clubs')
    .insert({
      name:         body.club_name,
      slug,
      description:  body.description ?? null,
      country_id:   body.country_id,
      room_id:      roomId,
      contact_info: {
        email:    body.email    ?? null,
        whatsapp: body.whatsapp ?? null,
      },
      is_active: true,
    })
    .select('id')
    .single();

  if (clubError) {
    return new Response(JSON.stringify({ error: clubError.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Marcar solicitud como aprobada
  await (supabase as any)
    .from('club_requests')
    .update({
      status:      'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminProfile.name ?? 'super_admin',
    })
    .eq('id', body.id);

  return new Response(JSON.stringify({ success: true, club_id: newClub?.id }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE — Rechazar solicitud
export const DELETE: APIRoute = async ({ request, locals }) => {
  const adminProfile = locals.adminProfile;
  if (adminProfile?.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServerClient();
  const body = await request.json() as { id?: number };

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'ID requerido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  await (supabase as any)
    .from('club_requests')
    .update({
      status:      'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminProfile.name ?? 'super_admin',
    })
    .eq('id', body.id);

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};