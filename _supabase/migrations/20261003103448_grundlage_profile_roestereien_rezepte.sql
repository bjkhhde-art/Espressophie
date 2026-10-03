-- Espressophie: Grundlage für Community (Röstereien, Rezepte, Profile)
-- Shot-Daten bleiben in Google Drive; hier nur, was geteilt wird.
-- Angewendet am 2026-10-03 auf Supabase-Projekt "Espressophie" (zzxkdfwuspxaqzdbnluk, Frankfurt).

-- ---------- Hilfsfunktion: updated_at automatisch setzen ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Profile: nur Anzeigename (keine E-Mail) ----------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Öffentlicher Anzeigename pro Konto (z. B. für Rezept-Autoren). Keine E-Mail.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil automatisch anlegen, wenn sich jemand registriert (Vorname aus dem Google-Konto)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1), 40), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Röstereien ----------
create table public.roasters (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (char_length(name) between 1 and 80),
  plz            text check (plz is null or char_length(plz) <= 10),
  ort            text check (ort is null or char_length(ort) <= 80),
  land           text not null default 'DE' check (char_length(land) = 2),
  beschreibung   text check (beschreibung is null or char_length(beschreibung) <= 600),
  website        text check (website is null or website ~* '^https?://'),
  shop           text check (shop is null or shop ~* '^https?://'),
  instagram      text check (instagram is null or instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  espresso_bohnen text[] not null default '{}',
  tags           text[] not null default '{}',
  nutzt_qr       boolean not null default false,
  status         text not null default 'entwurf' check (status in ('entwurf', 'freigegeben')),
  freigegeben_am timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.roasters is 'Röstereien-Verzeichnis. Öffentlich sichtbar nur mit status = freigegeben (Zustimmung der Rösterei).';
comment on column public.roasters.nutzt_qr is 'Druckt Espressophie-QR-Codes mit Startrezept auf Packungen';

create trigger roasters_updated_at before update on public.roasters
  for each row execute function public.set_updated_at();

create index roasters_status_name_idx on public.roasters (status, name);

-- ---------- Rezepte (gleiche Felder wie der Rezept-Link der App) ----------
create table public.recipes (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  roaster_id       uuid references public.roasters (id) on delete set null,
  bohne            text not null check (char_length(bohne) between 1 and 80),
  roesterei_name   text check (roesterei_name is null or char_length(roesterei_name) <= 80),
  roestgrad        text check (roestgrad is null or roestgrad in ('hell', 'mittel', 'dunkel')),
  roestalter_tage  smallint check (roestalter_tage is null or roestalter_tage between 0 and 365),
  zubereitung      text not null default 'Espresso' check (char_length(zubereitung) <= 40),
  muehle           text check (muehle is null or char_length(muehle) <= 80),
  maschine         text check (maschine is null or char_length(maschine) <= 80),
  mahlgrad         text check (mahlgrad is null or char_length(mahlgrad) <= 12),
  mahlgrad_wert    numeric(6,2),
  dosis_g          numeric(5,1) check (dosis_g is null or dosis_g between 1 and 100),
  ausbeute_g       numeric(6,1) check (ausbeute_g is null or ausbeute_g between 1 and 500),
  zeit_s           numeric(5,1) check (zeit_s is null or zeit_s between 1 and 300),
  temperatur_c     numeric(4,1) check (temperatur_c is null or temperatur_c between 50 and 105),
  druck_bar        numeric(4,1) check (druck_bar is null or druck_bar between 0 and 20),
  bewertung        smallint check (bewertung is null or bewertung between 1 and 5),
  balance          smallint check (balance is null or balance between -2 and 2),
  suesse           smallint check (suesse is null or suesse between 0 and 3),
  koerper          smallint check (koerper is null or koerper between 0 and 3),
  abgang           smallint check (abgang is null or abgang between 0 and 3),
  notiz            text check (notiz is null or char_length(notiz) <= 500),
  oeffentlich      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.recipes is 'Geteilte Rezepte. Sichtbar: eigene + öffentliche. Ändern/Löschen nur durch den Autor.';
comment on column public.recipes.mahlgrad is 'Anzeige wie an der Mühle, z. B. 9,5 oder 5C';
comment on column public.recipes.mahlgrad_wert is 'Interne Zahl zum Vergleichen/Sortieren';

create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create index recipes_author_idx on public.recipes (author_id);
create index recipes_roaster_idx on public.recipes (roaster_id);
create index recipes_public_idx on public.recipes (created_at desc) where oeffentlich;

-- ---------- Zugriffsregeln (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.roasters enable row level security;
alter table public.recipes  enable row level security;

-- Profile: Anzeigenamen sind öffentlich; jeder ändert nur sein eigenes
create policy "Profile sind öffentlich lesbar" on public.profiles
  for select to anon, authenticated using (true);
create policy "Eigenes Profil ändern" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Röstereien: nur freigegebene sind sichtbar; Pflege nur über das Dashboard (service_role)
create policy "Freigegebene Röstereien sind öffentlich" on public.roasters
  for select to anon, authenticated using (status = 'freigegeben');
revoke insert, update, delete on public.roasters from anon, authenticated;

-- Rezepte: öffentliche für alle, eigene immer; schreiben nur als Autor
create policy "Öffentliche und eigene Rezepte lesen" on public.recipes
  for select to anon, authenticated
  using (oeffentlich or (select auth.uid()) = author_id);
create policy "Eigene Rezepte anlegen" on public.recipes
  for insert to authenticated
  with check ((select auth.uid()) = author_id);
create policy "Eigene Rezepte ändern" on public.recipes
  for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Eigene Rezepte löschen" on public.recipes
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- Profile: kein Anlegen/Löschen durch Clients (passiert per Trigger bzw. Kontolöschung)
revoke insert, delete on public.profiles from anon, authenticated;
