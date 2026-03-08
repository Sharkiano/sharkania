// src/pages/api/club-requests.ts
import type { APIRoute } from 'astro';
import { createServerClient } from '@lib/supabase/server';

export const POST: APIRoute = async ({ request }) => {
  const supabase = createServerClient();

  const body = await request.json() as {
    admin_name?:    string;
    club_name?:     string;
    description?:   string;
    country_id?:    number;
    room_name?:     string;
    room_is_custom?: boolean;
    room_custom?:   string;
    email?:         string;
    whatsapp?:      string;
    telegram?:      string;
    instagram?:     string;
    has_league?:    boolean;
    league_name?:   string;
    league_bases?:  string;
  };

  if (!body.club_name?.trim())   return new Response(JSON.stringify({ error: 'Nombre del club requerido.' }),   { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!body.description?.trim()) return new Response(JSON.stringify({ error: 'Descripción requerida.' }),       { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!body.country_id)          return new Response(JSON.stringify({ error: 'País requerido.' }),              { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!body.room_name?.trim())   return new Response(JSON.stringify({ error: 'Sala de póker requerida.' }),     { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!body.email?.trim())       return new Response(JSON.stringify({ error: 'Email requerido.' }),             { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!body.whatsapp?.trim())    return new Response(JSON.stringify({ error: 'WhatsApp requerido.' }),          { status: 400, headers: { 'Content-Type': 'application/json' } });

  // Si el usuario escribió una sala custom, verificar si ya existe
  let finalRoomName    = body.room_name.trim();
  let finalRoomCustom  = body.room_custom?.trim() || null;
  let finalIsCustom    = body.room_is_custom ?? false;

  if (finalIsCustom && finalRoomCustom) {
    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id, name')
      .ilike('name', finalRoomCustom)
      .single();

    if (existingRoom) {
      // Ya existe — usar la sala existente, no marcar como custom
      finalRoomName   = existingRoom.name;
      finalIsCustom   = false;
      finalRoomCustom = null;
    }
  }

  const { error } = await (supabase as any)
    .from('club_requests')
    .insert({
      admin_name:    body.admin_name?.trim()  || null,
      club_name:     body.club_name.trim(),
      description:   body.description.trim(),
      country_id:    body.country_id,
      room_name:     finalRoomName,
      room_is_custom: finalIsCustom,
      room_custom:   finalRoomCustom,
      email:         body.email.trim(),
      whatsapp:      body.whatsapp.trim(),
      telegram:      body.telegram?.trim()  || null,
      instagram:     body.instagram?.trim() || null,
      has_league:    body.has_league   ?? false,
      league_name:   body.league_name  || null,
      league_bases:  body.league_bases || null,
    });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ success: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};