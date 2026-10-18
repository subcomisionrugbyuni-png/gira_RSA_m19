-- Gira Sudáfrica M19: pegar todo en Supabase → SQL Editor → Run. Se puede volver a correr sin perder datos.
-- Las tablas quedan cerradas; la app solo entra por estas funciones.

create extension if not exists pgcrypto;

create table if not exists public.gira (
  id int primary key default 1 check (id = 1),
  datos jsonb not null,      -- todo, para el panel
  publico jsonb not null,    -- solo lo visible, para la app
  actualizado timestamptz not null default now()
);

create table if not exists public.fotos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  datos text not null,       -- imagen en base64
  creado timestamptz not null default now()
);

alter table public.gira enable row level security;
alter table public.fotos enable row level security;
revoke all on public.gira, public.fotos from anon, authenticated;

-- Contraseña del panel /administrador: se guarda solo su hash (bcrypt), nunca en texto plano.
-- Para definirla o cambiarla, correr en el SQL Editor (cambiando NUEVA_CLAVE):
--   insert into public.ajustes (id, clave_hash) values (1, crypt('NUEVA_CLAVE', gen_salt('bf')))
--   on conflict (id) do update set clave_hash = excluded.clave_hash;
create table if not exists public.ajustes (
  id int primary key default 1 check (id = 1),
  clave_hash text not null
);
alter table public.ajustes enable row level security;
revoke all on public.ajustes from anon, authenticated;

create or replace function public.clave_ok(clave text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from ajustes where id = 1 and clave_hash = crypt(clave, clave_hash))
$$;
revoke all on function public.clave_ok(text) from public, anon, authenticated;

create or replace function public.leer_publico() returns jsonb
language sql stable security definer set search_path = public as $$
  select publico from gira where id = 1
$$;

create or replace function public.leer_admin(clave text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not clave_ok(clave) then raise exception 'clave_incorrecta'; end if;
  return (select datos from gira where id = 1);
end $$;

create or replace function public.guardar(clave text, datos jsonb, publico jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not clave_ok(clave) then raise exception 'clave_incorrecta'; end if;
  insert into gira (id, datos, publico, actualizado) values (1, datos, publico, now())
  on conflict (id) do update set datos = excluded.datos, publico = excluded.publico, actualizado = now();
end $$;

create or replace function public.subir_foto(clave text, tipo text, datos text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  if not clave_ok(clave) then raise exception 'clave_incorrecta'; end if;
  insert into fotos (tipo, datos) values (tipo, datos) returning id into nuevo;
  return nuevo;
end $$;

create or replace function public.borrar_fotos(clave text, ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not clave_ok(clave) then raise exception 'clave_incorrecta'; end if;
  delete from fotos where id = any(ids);
end $$;

create or replace function public.leer_foto(foto uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tipo', tipo, 'datos', datos) from fotos where id = foto
$$;

grant execute on function public.leer_publico(), public.leer_admin(text), public.guardar(text, jsonb, jsonb),
  public.subir_foto(text, text, text), public.borrar_fotos(text, uuid[]), public.leer_foto(uuid)
  to anon, authenticated;
