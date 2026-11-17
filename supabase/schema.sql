-- F1 Zeitenliste – Datenbank (Schritt 2)
-- Im Supabase SQL Editor komplett einfügen und ausführen ("Run").
-- Darf mehrfach ausgeführt werden; vorhandene Zeiten bleiben erhalten.
--
-- VOR DEM AUSFÜHREN: unten bei "admin_emails" die E-Mails der Admin-Benutzer prüfen.
--
-- Aufbau:
--   public.laps          Rundenzeiten (für die App sichtbar)
--   private.einstellungen Event-Code (für die App NICHT sichtbar)
--   private.admins       Benutzer-IDs mit allen Rechten
-- Regeln (Row Level Security):
--   Gäste (anon) mit richtigem Event-Code: lesen und eintragen. Nie ändern oder löschen.
--   Admin (angemeldet und in private.admins): alles, auch ohne Event-Code.
-- Der Event-Code kommt als HTTP-Header "x-event-code" (die App liest ihn aus ?code=… im Link).

create extension if not exists pgcrypto with schema extensions;

-- ---------- Privates Schema (wird von der API nicht ausgeliefert) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.einstellungen (
  id         boolean primary key default true check (id),   -- genau eine Zeile
  event_code text not null check (length(event_code) between 4 and 64)
);

-- Event-Code nur beim ersten Mal zufällig erzeugen (8 Zeichen, ohne verwechselbare Zeichen).
insert into private.einstellungen (event_code)
select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31), 1), '')
from generate_series(1, 8)
on conflict (id) do nothing;

create table if not exists private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Admin-Benutzer eintragen (E-Mails anpassen!). Die Benutzer müssen vorher unter
-- Authentication → Users angelegt sein. Fehlt einer, gibt es nur einen Hinweis.
do $$
declare
  admin_emails text[] := array['admin1@example.com', 'admin2@example.com'];
  mail text;
  uid uuid;
begin
  foreach mail in array admin_emails loop
    select id into uid from auth.users where lower(email) = lower(mail);
    if uid is null then
      raise notice 'Kein Benutzer mit der E-Mail % gefunden – zuerst unter Authentication → Users anlegen.', mail;
    else
      insert into private.admins (user_id) values (uid) on conflict do nothing;
    end if;
  end loop;
  if not exists (select 1 from private.admins) then
    raise exception 'Kein Admin gefunden. Bitte die E-Mails in admin_emails prüfen.';
  end if;
end $$;

-- ---------- Hilfsfunktionen ----------
-- Laufen mit den Rechten des Besitzers (security definer), damit sie das private Schema lesen dürfen.

create or replace function public.ist_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.event_code_ok()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.einstellungen e
    where e.event_code = (nullif(current_setting('request.headers', true), '')::json ->> 'x-event-code')
  );
$$;

revoke all on function public.ist_admin() from public;
revoke all on function public.event_code_ok() from public;
grant execute on function public.ist_admin() to anon, authenticated;
grant execute on function public.event_code_ok() to anon, authenticated;

-- ---------- Tabelle laps ----------
create table if not exists public.laps (
  id         bigint generated always as identity primary key,
  client_id  uuid unique,                          -- von der App erzeugt; verhindert doppelte Einträge beim erneuten Senden
  name       text not null check (length(btrim(name)) between 1 and 40),
  strecke    text not null check (length(btrim(strecke)) between 1 and 40),
  station    text not null check (station in ('R21', 'R5', 'G29')),
  auto       text not null default '' check (length(auto) <= 40),
  zeit_ms    integer not null check (zeit_ms between 1 and 599999),
  s1_ms      integer check (s1_ms between 1 and 599999),
  s2_ms      integer check (s2_ms between 1 and 599999),
  s3_ms      integer check (s3_ms between 1 and 599999),
  created_at timestamptz not null default now(),
  constraint sektoren_nicht_laenger check (coalesce(s1_ms, 0) + coalesce(s2_ms, 0) + coalesce(s3_ms, 0) <= zeit_ms),
  constraint sektoren_summe check (
    s1_ms is null or s2_ms is null or s3_ms is null or s1_ms + s2_ms + s3_ms = zeit_ms)
);

create index if not exists laps_created_at_idx on public.laps (created_at);
create index if not exists laps_name_idx on public.laps (lower(name), created_at);

-- ---------- Rechte (Tabellen werden nicht automatisch freigegeben) ----------
revoke all on public.laps from public, anon, authenticated;
grant select, insert on public.laps to anon;
grant select, insert, update, delete on public.laps to authenticated;

-- ---------- Row Level Security ----------
alter table public.laps enable row level security;

drop policy if exists laps_lesen on public.laps;
create policy laps_lesen on public.laps
  for select to anon, authenticated
  using ((select public.event_code_ok()) or (select public.ist_admin()));

drop policy if exists laps_eintragen on public.laps;
create policy laps_eintragen on public.laps
  for insert to anon, authenticated
  with check ((select public.event_code_ok()) or (select public.ist_admin()));

drop policy if exists laps_aendern on public.laps;
create policy laps_aendern on public.laps
  for update to authenticated
  using ((select public.ist_admin()))
  with check ((select public.ist_admin()));

drop policy if exists laps_loeschen on public.laps;
create policy laps_loeschen on public.laps
  for delete to authenticated
  using ((select public.ist_admin()));

-- ---------- Prüfungen beim Eintragen (Missbrauch begrenzen) ----------
-- Gäste: Zeitstempel setzt immer der Server, Leerzeichen werden entfernt,
-- höchstens 1 Eintrag pro Name alle 10 Sekunden, höchstens 60 Einträge pro Minute insgesamt,
-- höchstens 3000 Einträge in der Tabelle. Der Admin (z. B. CSV-Import) ist davon ausgenommen.
create or replace function private.laps_pruefen()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.strecke := btrim(new.strecke);
  new.auto := btrim(coalesce(new.auto, ''));

  -- Schon gespeichert (App sendet nach Netzproblem erneut): still überspringen.
  if tg_op = 'INSERT' and new.client_id is not null
     and exists (select 1 from public.laps l where l.client_id = new.client_id) then
    return null;
  end if;

  if tg_op = 'INSERT' and not public.ist_admin() then
    new.created_at := now();
    if exists (select 1 from public.laps l
               where lower(l.name) = lower(new.name) and l.created_at > now() - interval '10 seconds') then
      raise exception 'Bitte kurz warten, bevor du die nächste Zeit einträgst.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.laps l where l.created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Gerade werden zu viele Zeiten eingetragen. Bitte gleich nochmal versuchen.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.laps) >= 3000 then
      raise exception 'Die Zeitenliste ist voll.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists laps_pruefen on public.laps;
create trigger laps_pruefen
  before insert or update on public.laps
  for each row execute function private.laps_pruefen();

-- ---------- Live-Aktualisierung ----------
-- Nach jeder Änderung geht ein kurzes Signal ohne Inhalt (keine Namen, keine Zeiten) an den
-- Realtime-Kanal "laps". Die App lädt daraufhin die Zeiten neu – mit Event-Code-Prüfung.
create or replace function private.laps_melden()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform realtime.send(jsonb_build_object('op', tg_op), 'geaendert', 'laps', false);
  exception when others then
    null;  -- ein Fehler beim Signal darf das Eintragen nie verhindern
  end;
  return null;
end $$;

drop trigger if exists laps_melden on public.laps;
create trigger laps_melden
  after insert or update or delete on public.laps
  for each statement execute function private.laps_melden();

-- ---------- Ergebnis anzeigen ----------
select
  (select event_code from private.einstellungen) as event_code,
  (select count(*) from private.admins) as anzahl_admins,
  (select count(*) from public.laps) as anzahl_zeiten;
