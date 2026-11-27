-- =====================================================================
-- Orbite — classement en ligne (version 2.0)
-- À coller dans Supabase : SQL Editor > New query > Run.
-- Le script peut être relancé sans risque (il remplace les fonctions).
--
-- Principe de sécurité : le jeu (clé publique) n'a AUCUN accès direct
-- aux tables. Il passe uniquement par des fonctions qui vérifient tout
-- côté serveur : set_pseudo, submit_score, get_leaderboard, player_info,
-- set_skins et player_profile (2.3).
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

-- Historique des changements de pseudo (limite de 3 par mois, « anciennement … », pseudo réservé 30 jours)
create table if not exists public.pseudo_changes (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  old_pseudo  text not null,
  old_key     text not null,
  new_pseudo  text not null,
  changed_at  timestamptz not null default now()
);
create index if not exists pseudo_changes_player_idx on public.pseudo_changes (player_id, changed_at);
create index if not exists pseudo_changes_oldkey_idx on public.pseudo_changes (old_key, changed_at);

-- Skins des joueurs (2.3) : affichés dans le profil public. Envoyés par le jeu (set_skins) ; null = pas encore envoyés.
alter table public.players add column if not exists skin     text;
alter table public.players add column if not exists skins    text[];
alter table public.players add column if not exists skins_at timestamptz;

-- Aucun accès direct aux tables depuis le jeu : sécurité au niveau des lignes activée, sans règle d'accès.
alter table public.players enable row level security;
alter table public.scores  enable row level security;
alter table public.pseudo_changes enable row level security;
revoke all on public.players, public.scores, public.pseudo_changes from anon, authenticated;

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

-- Début du mois en cours (heure de Paris) : le compteur de changements repart à zéro le 1er.
create or replace function public.orbite_month_start() returns timestamptz
language sql stable as $$
  select date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

-- ---------- 1. Choisir ou changer son pseudo ----------
-- Le premier pseudo est libre ; ensuite 3 changements par mois au plus.
-- Un ancien pseudo reste réservé à son propriétaire pendant 30 jours.
create or replace function public.set_pseudo(p_id uuid, p_pseudo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pseudo text := btrim(regexp_replace(coalesce(p_pseudo, ''), '\s+', ' ', 'g'));
  v_key    text;
  v_flat   text;
  v_old    text;
  v_old_key text;
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
  if exists (select 1 from players where pseudo_key = v_key and id <> p_id)
     or exists (select 1 from pseudo_changes where old_key = v_key and player_id <> p_id
                and changed_at > now() - interval '30 days') then
    raise exception 'pseudo_pris';
  end if;
  select pseudo, pseudo_key into v_old, v_old_key from players where id = p_id;
  if not found then
    insert into players (id, pseudo, pseudo_key) values (p_id, v_pseudo, v_key);
    return v_pseudo;
  end if;
  if v_old = v_pseudo then return v_pseudo; end if;            -- rien ne change
  if (select count(*) from pseudo_changes where player_id = p_id and changed_at >= orbite_month_start()) >= 3 then
    raise exception 'pseudo_limite';
  end if;
  insert into pseudo_changes (player_id, old_pseudo, old_key, new_pseudo) values (p_id, v_old, v_old_key, v_pseudo);
  update players set pseudo = v_pseudo, pseudo_key = v_key where id = p_id;
  return v_pseudo;
end $$;

-- Infos du joueur pour le jeu : pseudo, changements restants ce mois-ci, date de remise à zéro.
create or replace function public.player_info(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pseudo', p.pseudo,
    'changes_left', greatest(0, 3 - (select count(*) from pseudo_changes c where c.player_id = p.id and c.changed_at >= orbite_month_start())),
    'next_reset', to_char(orbite_month_start() at time zone 'Europe/Paris' + interval '1 month', 'YYYY-MM-DD'))
  from players p where p.id = p_id
$$;

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
drop function if exists public.get_leaderboard(text, text, uuid, integer);   -- la liste des colonnes a changé (old_pseudo)
create or replace function public.get_leaderboard(p_sort text, p_period text, p_me uuid default null, p_limit integer default 50)
returns table (rank bigint, pseudo text, old_pseudo text, laps integer, duration real, gems integer, best_chain integer, is_me boolean)
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
  select rk, pseudo,
    (select c.old_pseudo from pseudo_changes c where c.player_id = ranked.player_id
      and c.changed_at > now() - interval '30 days' order by c.changed_at desc limit 1),
    laps, duration, gems, best_chain, (player_id = p_me)
  from ranked
  where rk <= least(greatest(p_limit, 1), 100) or player_id = p_me
  order by rk, created_at
$$;

-- ---------- 4. Profil public (2.3) ----------
-- Skins débloqués et skin équipé, envoyés par le jeu. Seuls les skins connus sont gardés ; la Sonde est toujours là.
create or replace function public.set_skins(p_id uuid, p_skin text, p_skins text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_known text[] := array['sonde','comete','glacier','nebuleuse','aurore','trounoir','mezen'];
  v_skins text[];
  v_last  timestamptz;
begin
  select skins_at into v_last from players where id = p_id;
  if not found then raise exception 'joueur_inconnu'; end if;
  if v_last is not null and now() - v_last < interval '2 seconds' then raise exception 'trop_rapide'; end if;
  select array_agg(k order by array_position(v_known, k)) into v_skins
    from unnest(v_known) k where k = 'sonde' or k = any(coalesce(p_skins, '{}'));
  update players set skins = v_skins, skin = case when p_skin = any(v_skins) then p_skin else 'sonde' end, skins_at = now()
   where id = p_id;
  return true;
end $$;

-- Profil d'un joueur du classement, retrouvé par son pseudo (l'identifiant secret n'est jamais montré).
create or replace function public.player_profile(p_pseudo text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pseudo', p.pseudo,
    'old_pseudo', (select c.old_pseudo from pseudo_changes c where c.player_id = p.id
                    and c.changed_at > now() - interval '30 days' order by c.changed_at desc limit 1),
    'since', to_char(p.created_at at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'games', (select count(*) from scores s where s.player_id = p.id),
    'laps_total', (select coalesce(sum(laps), 0) from scores s where s.player_id = p.id),
    'best', (select coalesce(max(laps), 0) from scores s where s.player_id = p.id),
    'best_date', (select to_char(s.created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') from scores s
                   where s.player_id = p.id order by s.laps desc, s.created_at asc limit 1),
    'best_gems', (select coalesce(max(gems), 0) from scores s where s.player_id = p.id),
    'best_chain', (select coalesce(max(best_chain), 0) from scores s where s.player_id = p.id),
    'rank', (select 1 + count(*) from (select player_id, max(laps) m from scores group by player_id) b
              where b.m > (select coalesce(max(laps), 0) from scores s where s.player_id = p.id)),
    'skin', p.skin,
    'skins', p.skins)
  from players p where p.pseudo_key = orbite_norm(btrim(coalesce(p_pseudo, '')))
$$;

-- Le jeu (clé publique) ne peut appeler QUE ces fonctions.
revoke all on function public.set_pseudo(uuid, text) from public;
revoke all on function public.submit_score(uuid, integer, real, integer, integer, text) from public;
revoke all on function public.get_leaderboard(text, text, uuid, integer) from public;
revoke all on function public.player_info(uuid) from public;
revoke all on function public.orbite_norm(text), public.orbite_max_laps(real), public.orbite_min_laps(real), public.orbite_month_start() from public;
grant execute on function public.player_info(uuid) to anon, authenticated;
grant execute on function public.set_pseudo(uuid, text) to anon, authenticated;
grant execute on function public.submit_score(uuid, integer, real, integer, integer, text) to anon, authenticated;
grant execute on function public.get_leaderboard(text, text, uuid, integer) to anon, authenticated;
revoke all on function public.set_skins(uuid, text, text[]) from public;
revoke all on function public.player_profile(text) from public;
grant execute on function public.set_skins(uuid, text, text[]) to anon, authenticated;
grant execute on function public.player_profile(text) to anon, authenticated;

-- =====================================================================
-- 5. Statistiques anonymes (2.6)
-- Événements envoyés par le jeu SANS pseudo ni identifiant de joueur : seulement un numéro tiré au hasard
-- sur l'appareil (aid). Le joueur peut couper l'envoi (Réglages > Confidentialité). Effacés après 13 mois.
-- Lecture par le propriétaire uniquement, dans l'éditeur SQL : schéma « stats » (jamais exposé au jeu).
-- =====================================================================
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  aid        uuid not null,
  kind       text not null,
  data       jsonb not null default '{}',
  version    text,
  platform   text,
  at         timestamptz not null default now()
);
create index if not exists events_at_idx  on public.events (at);
create index if not exists events_aid_idx on public.events (aid, at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

create or replace function public.log_events(p_aid uuid, p_version text, p_platform text, p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_kinds text[] := array['open','game','tuto','buy','revive','view'];
  v_n integer := 0;
  e jsonb;
  v_at timestamptz;
begin
  if p_aid is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then raise exception 'invalide'; end if;
  if (select count(*) from events where aid = p_aid and at > now() - interval '1 day') > 2000 then raise exception 'trop_rapide'; end if;
  for e in select * from jsonb_array_elements(p_events) loop
    continue when not (e->>'k' = any(v_kinds)) or jsonb_typeof(coalesce(e->'d', '{}')) <> 'object' or length((e->'d')::text) > 600;
    begin v_at := (e->>'at')::timestamptz; exception when others then v_at := now(); end;
    if v_at is null or v_at > now() or v_at < now() - interval '30 days' then v_at := now(); end if;
    insert into events (aid, kind, data, version, platform, at)
    values (p_aid, e->>'k', coalesce(e->'d', '{}'), left(p_version, 20), left(p_platform, 20), v_at);
    v_n := v_n + 1;
  end loop;
  if random() < 0.01 then delete from events where at < now() - interval '13 months'; end if;   -- ménage
  return v_n;
end $$;
revoke all on function public.log_events(uuid, text, text, jsonb) from public;
grant execute on function public.log_events(uuid, text, text, jsonb) to anon, authenticated;

-- ---------- Vues pour le propriétaire (éditeur SQL : select * from stats.jours;) ----------
create schema if not exists stats;
revoke all on schema stats from public, anon, authenticated;

-- Hors adresse de test (version « -test ») et hors entraînement.
create or replace view stats.parties as
  select aid, at, version, platform, (data->>'laps')::int laps, (data->>'dur')::int duree, (data->>'gems')::int eclats,
         (data->>'hard')::boolean difficile, (data->>'revived')::boolean seconde_chance, (data->>'record')::boolean record
  from public.events where kind = 'game' and version not like '%-test' and data->>'train' is null;

-- Une ligne par jour (heure de Paris) : appareils actifs, nouveaux, parties, tours.
create or replace view stats.jours as
  with ev as (select aid, (at at time zone 'Europe/Paris')::date jour, kind, data, platform from public.events where version not like '%-test'),
  premiers as (select aid, min(jour) jour from ev group by aid)
  select e.jour,
    count(distinct e.aid) as appareils_actifs,
    (select count(*) from premiers p where p.jour = e.jour) as nouveaux,
    count(*) filter (where kind = 'game' and data->>'train' is null) as parties,
    round(avg((data->>'laps')::int) filter (where kind = 'game' and data->>'train' is null), 1) as tours_moyens,
    max((data->>'laps')::int) filter (where kind = 'game' and data->>'train' is null) as tours_max,
    count(distinct e.aid) filter (where platform like '%-app') as appareils_appli_installee
  from ev e group by e.jour order by e.jour desc;

-- Résumé : appareils, parties, plateformes (7 et 30 derniers jours).
create or replace view stats.resume as
  select periode,
    count(distinct aid) as appareils,
    count(*) filter (where kind = 'game' and data->>'train' is null) as parties,
    count(*) filter (where kind = 'game' and data->>'train' is not null) as entrainements,
    count(distinct aid) filter (where platform like 'ios%') as iphone,
    count(distinct aid) filter (where platform like 'android%') as android,
    count(distinct aid) filter (where platform like 'desktop%') as ordinateur,
    count(distinct aid) filter (where platform like '%-app') as appli_installee
  from (select '7 jours' periode, * from public.events where at > now() - interval '7 days' and version not like '%-test'
        union all select '30 jours', * from public.events where at > now() - interval '30 days' and version not like '%-test') x
  group by periode;

-- Quelle part des parties atteint chaque palier.
create or replace view stats.paliers as
  select count(*) as parties,
    round(100.0 * count(*) filter (where laps >= 10)  / nullif(count(*), 0), 1) as pct_10,
    round(100.0 * count(*) filter (where laps >= 30)  / nullif(count(*), 0), 1) as pct_30_pluie,
    round(100.0 * count(*) filter (where laps >= 40)  / nullif(count(*), 0), 1) as pct_40_rapides,
    round(100.0 * count(*) filter (where laps >= 50)  / nullif(count(*), 0), 1) as pct_50_inversion,
    round(100.0 * count(*) filter (where laps >= 100) / nullif(count(*), 0), 1) as pct_100,
    round(100.0 * count(*) filter (where laps >= 200) / nullif(count(*), 0), 1) as pct_200
  from stats.parties;

-- Fidélité : parmi les appareils arrivés un jour donné, combien sont revenus le lendemain, et 7 jours après.
create or replace view stats.fidelite as
  with j as (select distinct aid, (at at time zone 'Europe/Paris')::date jour from public.events where version not like '%-test'),
  f as (select aid, min(jour) premier from j group by aid)
  select f.premier as arrives_le, count(*) as appareils,
    count(*) filter (where exists (select 1 from j where j.aid = f.aid and j.jour = f.premier + 1)) as revenus_j1,
    count(*) filter (where exists (select 1 from j where j.aid = f.aid and j.jour between f.premier + 7 and f.premier + 13)) as revenus_semaine_2
  from f group by f.premier order by f.premier desc;

-- Didacticiel, skins achetés, seconde chance, écrans ouverts.
create or replace view stats.didacticiel as
  select data->>'from' as lance_depuis, count(*) as fois,
    count(*) filter (where (data->>'done')::boolean) as termines, round(avg((data->>'step')::int), 1) as etape_moyenne_quittee
  from public.events where kind = 'tuto' and version not like '%-test' group by 1;
create or replace view stats.skins as
  select data->>'skin' as skin, count(*) as achats from public.events where kind = 'buy' and version not like '%-test' group by 1 order by 2 desc;
create or replace view stats.seconde_chance as
  select count(*) filter (where (data->>'used')::boolean) as utilisees, count(*) filter (where not (data->>'used')::boolean) as refusees,
    round(avg((data->>'laps')::int) filter (where (data->>'used')::boolean), 1) as tour_moyen_utilisee
  from public.events where kind = 'revive' and version not like '%-test';
create or replace view stats.ecrans as
  select data->>'s' as ecran, count(*) as ouvertures, count(distinct aid) as appareils
  from public.events where kind = 'view' and version not like '%-test' group by 1 order by 2 desc;
revoke all on all tables in schema stats from public, anon, authenticated;
