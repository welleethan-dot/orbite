-- =====================================================================
-- Orbite — classement en ligne (version 2.0)
-- À coller dans Supabase : SQL Editor > New query > Run.
-- Le script peut être relancé sans risque (il remplace les fonctions).
--
-- Principe de sécurité : le jeu (clé publique) n'a AUCUN accès direct
-- aux tables. Il passe uniquement par 3 fonctions qui vérifient tout
-- côté serveur : set_pseudo, submit_score, get_leaderboard.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.players (
  id            uuid primary key,                 -- identifiant secret, créé sur l'appareil du joueur
  pseudo        text not null,
  pseudo_key    text not null unique,             -- pseudo normalisé (minuscules, sans accents) : unicité
  created_at    timestamptz not null default now(),
  last_score_at timestamptz
);

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  laps        integer not null check (laps between 0 and 100000),
  duration    real    not null check (duration between 0 and 36000),   -- secondes de jeu (hors pause)
  gems        integer not null check (gems >= 0),
  best_chain  integer not null check (best_chain >= 0),                -- meilleure série de frôlements
  version     text,
  created_at  timestamptz not null default now()
);
create index if not exists scores_created_at_idx on public.scores (created_at);
create index if not exists scores_player_idx     on public.scores (player_id);

-- Aucun accès direct aux tables depuis le jeu : sécurité au niveau des lignes activée, sans règle d'accès.
alter table public.players enable row level security;
alter table public.scores  enable row level security;
revoke all on public.players, public.scores from anon, authenticated;

-- ---------- Outils ----------
-- Pseudo normalisé : minuscules, accents retirés, chiffres « leet » remplacés.
create or replace function public.orbite_norm(p text) returns text
language sql immutable as $$
  select translate(lower(p),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ013457@$',
    'aaaaaaceeeeiiiinooooouuuuyyoieastas')
$$;

-- Nombre maximal de tours possible en p_duration secondes (vitesse de la partie difficile, la plus rapide).
create or replace function public.orbite_max_laps(p_duration real) returns real
language sql immutable as $$
  select (case when p_duration <= 1.85/0.046
            then 1.75*p_duration + 0.023*p_duration^2
            else 1.75*(1.85/0.046) + 0.023*(1.85/0.046)^2 + 3.6*(p_duration - 1.85/0.046)
          end) / (2*pi())
$$;

-- Nombre minimal de tours en p_duration secondes (vitesse de la partie normale, la plus lente).
create or replace function public.orbite_min_laps(p_duration real) returns real
language sql immutable as $$
  select (case when p_duration <= 1.75/0.039
            then 1.5*p_duration + 0.0195*p_duration^2
            else 1.5*(1.75/0.039) + 0.0195*(1.75/0.039)^2 + 3.25*(p_duration - 1.75/0.039)
          end) / (2*pi())
$$;

-- ---------- 1. Choisir ou changer son pseudo ----------
create or replace function public.set_pseudo(p_id uuid, p_pseudo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pseudo text := btrim(regexp_replace(coalesce(p_pseudo, ''), '\s+', ' ', 'g'));
  v_key    text;
  v_flat   text;
begin
  if p_id is null then raise exception 'joueur_inconnu'; end if;
  if char_length(v_pseudo) < 3 or char_length(v_pseudo) > 16
     or v_pseudo !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]+$' then
    raise exception 'pseudo_invalide';
  end if;
  v_key  := orbite_norm(v_pseudo);
  v_flat := regexp_replace(v_key, '[^a-z]', '', 'g');
  -- Filtre de grossièretés (mots inclus n'importe où, et mots courts seulement isolés)
  if v_flat ~ '(connard|connasse|salope|pute|encul|batard|nique|bite|couille|chier|putain|merde|nazi|hitler|fuck|shit|bitch|cunt|nigg|fagg|dick|pussy|whore|slut|asshole|negre|bougnoul|pedale|tapette)'
     or v_key ~ '(^|[^a-z])(pd|fdp|ntm|tg|ta mere|ta race)([^a-z]|$)' then
    raise exception 'pseudo_interdit';
  end if;
  if exists (select 1 from players where pseudo_key = v_key and id <> p_id) then
    raise exception 'pseudo_pris';
  end if;
  insert into players (id, pseudo, pseudo_key) values (p_id, v_pseudo, v_key)
  on conflict (id) do update set pseudo = excluded.pseudo, pseudo_key = excluded.pseudo_key;
  return v_pseudo;
end $$;

-- ---------- 2. Envoyer le score d'une partie ----------
create or replace function public.submit_score(
  p_id uuid, p_laps integer, p_duration real, p_gems integer, p_best_chain integer, p_version text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_today integer;
begin
  select last_score_at into v_last from players where id = p_id;
  if not found then raise exception 'joueur_inconnu'; end if;

  -- Limites d'envoi : une partie toutes les 3 secondes au plus, 400 par jour au plus.
  if v_last is not null and now() - v_last < interval '3 seconds' then raise exception 'trop_rapide'; end if;
  select count(*) into v_today from scores where player_id = p_id and created_at > now() - interval '1 day';
  if v_today >= 400 then raise exception 'trop_rapide'; end if;

  -- Vraisemblance : tours cohérents avec le temps joué (dans les deux sens), éclats et frôlements plafonnés.
  if p_laps is null or p_duration is null or p_gems is null or p_best_chain is null
     or p_laps < 0 or p_duration < 0 or p_gems < 0 or p_best_chain < 0
     or p_laps > orbite_max_laps(p_duration) * 1.03 + 1
     or p_laps < orbite_min_laps(p_duration) * 0.97 - 2
     or p_gems > 3 * floor(p_laps / 5.0) + 3
     or p_best_chain > 3 * p_laps + 3 then
    raise exception 'score_impossible';
  end if;

  insert into scores (player_id, laps, duration, gems, best_chain, version)
  values (p_id, p_laps, p_duration, p_gems, p_best_chain, left(p_version, 16));
  update players set last_score_at = now() where id = p_id;
  return true;
end $$;

-- ---------- 3. Lire un classement ----------
-- p_sort   : 'laps' (tours), 'gems' (éclats), 'chain' (meilleure série de frôlements)
-- p_period : 'week' (depuis lundi, heure de Paris) ou 'all' (tous les temps)
-- Une seule ligne par joueur (son meilleur résultat), + la ligne du joueur s'il est hors du top.
create or replace function public.get_leaderboard(p_sort text, p_period text, p_me uuid default null, p_limit integer default 50)
returns table (rank bigint, pseudo text, laps integer, duration real, gems integer, best_chain integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select * from scores
    where p_period <> 'week'
       or created_at >= (date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
  ),
  best as (
    select distinct on (player_id) player_id, laps, duration, gems, best_chain, created_at,
      case p_sort when 'gems' then gems when 'chain' then best_chain else laps end as v
    from s
    order by player_id, (case p_sort when 'gems' then gems when 'chain' then best_chain else laps end) desc, created_at asc
  ),
  ranked as (
    select rank() over (order by b.v desc) as rk, b.*, p.pseudo
    from best b join players p on p.id = b.player_id
    where b.v > 0
  )
  select rk, pseudo, laps, duration, gems, best_chain, (player_id = p_me)
  from ranked
  where rk <= least(greatest(p_limit, 1), 100) or player_id = p_me
  order by rk, created_at
$$;

-- Le jeu (clé publique) ne peut appeler QUE ces trois fonctions.
revoke all on function public.set_pseudo(uuid, text) from public;
revoke all on function public.submit_score(uuid, integer, real, integer, integer, text) from public;
revoke all on function public.get_leaderboard(text, text, uuid, integer) from public;
revoke all on function public.orbite_norm(text), public.orbite_max_laps(real), public.orbite_min_laps(real) from public;
grant execute on function public.set_pseudo(uuid, text) to anon, authenticated;
grant execute on function public.submit_score(uuid, integer, real, integer, integer, text) to anon, authenticated;
grant execute on function public.get_leaderboard(text, text, uuid, integer) to anon, authenticated;
