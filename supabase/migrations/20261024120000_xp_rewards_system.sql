-- XP rewards: authoritative XP calculation, global/team reward controls and claims.
create table if not exists public.xp_reward_settings (
  id smallint primary key default 1 check (id = 1),
  global_enabled boolean not null default false,
  team_enabled boolean not null default false,
  lesson_xp integer not null default 20 check (lesson_xp between 0 and 1000),
  quiz_xp_per_ten_percent integer not null default 1 check (quiz_xp_per_ten_percent between 0 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.xp_reward_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.xp_rewards (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','team')),
  team_id uuid references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  xp_required integer not null check (xp_required > 0),
  reward_type text not null default 'badge' check (reward_type in ('badge','digital','physical','perk','other')),
  reward_details text not null default '' check (char_length(reward_details) <= 1000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xp_rewards_scope_team_check check ((scope = 'global' and team_id is null) or (scope = 'team' and team_id is not null))
);
create index if not exists xp_rewards_scope_active_idx on public.xp_rewards(scope, active);
create index if not exists xp_rewards_team_active_idx on public.xp_rewards(team_id, active) where team_id is not null;

create table if not exists public.xp_reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.xp_rewards(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled')),
  claimed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 1000),
  unique (reward_id, user_id)
);
create index if not exists xp_reward_claims_status_idx on public.xp_reward_claims(status, claimed_at desc);
create index if not exists xp_reward_claims_user_idx on public.xp_reward_claims(user_id, claimed_at desc);

alter table public.xp_reward_settings enable row level security;
alter table public.xp_rewards enable row level security;
alter table public.xp_reward_claims enable row level security;
revoke all on public.xp_reward_settings, public.xp_rewards, public.xp_reward_claims from anon, authenticated;

create or replace function public.xp_points_for_user(p_user_id uuid, p_team_id uuid default null)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select
    coalesce((
      select count(*)::bigint * s.lesson_xp
      from public.video_progress vp
      join public.playlist_videos pv on pv.id = vp.playlist_video_id
      join public.playlists pl on pl.id = pv.playlist_id
      cross join public.xp_reward_settings s
      where vp.user_id = p_user_id
        and vp.completed_at is not null
        and (p_team_id is null or pl.team_id = p_team_id)
      group by s.lesson_xp
    ), 0)
    +
    coalesce((
      select sum(round(ta.percentage::numeric / 10)::bigint * s.quiz_xp_per_ten_percent)::bigint
      from public.test_attempts ta
      join public.test_series ts on ts.id = ta.test_id
      cross join public.xp_reward_settings s
      where ta.user_id = p_user_id
        and ta.submitted_at is not null
        and (p_team_id is null or ts.team_id = p_team_id)
      group by s.quiz_xp_per_ten_percent
    ), 0);
$$;
revoke all on function public.xp_points_for_user(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_xp_reward_center(p_team_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v_user uuid := auth.uid(); v_settings public.xp_reward_settings%rowtype; v_global_xp bigint; v_team_xp bigint := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_settings from public.xp_reward_settings where id = 1;
  if p_team_id is not null then
    if not exists (select 1 from public.team_members tm where tm.team_id = p_team_id and tm.user_id = v_user) then
      raise exception 'You must be a member of this team';
    end if;
    v_team_xp := public.xp_points_for_user(v_user, p_team_id);
  end if;
  v_global_xp := public.xp_points_for_user(v_user, null);
  return jsonb_build_object(
    'settings', jsonb_build_object('global_enabled',v_settings.global_enabled,'team_enabled',v_settings.team_enabled,'lesson_xp',v_settings.lesson_xp,'quiz_xp_per_ten_percent',v_settings.quiz_xp_per_ten_percent),
    'global_xp',v_global_xp,'team_xp',v_team_xp,
    'global_rewards', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'xp_required',r.xp_required,'reward_type',r.reward_type,'reward_details',r.reward_details,'active',r.active,'claim_status',c.status) order by r.xp_required)
      from public.xp_rewards r left join public.xp_reward_claims c on c.reward_id=r.id and c.user_id=v_user
      where r.scope='global' and r.active), '[]'::jsonb),
    'team_rewards', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'xp_required',r.xp_required,'reward_type',r.reward_type,'reward_details',r.reward_details,'active',r.active,'claim_status',c.status) order by r.xp_required)
      from public.xp_rewards r left join public.xp_reward_claims c on c.reward_id=r.id and c.user_id=v_user
      where r.scope='team' and r.team_id=p_team_id and r.active), '[]'::jsonb),
    'recent_claims', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'reward_id',c.reward_id,'status',c.status,'claimed_at',c.claimed_at,'review_note',c.review_note,'reward_title',r.title) order by c.claimed_at desc)
      from public.xp_reward_claims c join public.xp_rewards r on r.id=c.reward_id where c.user_id=v_user), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_xp_team_leaderboard(p_team_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.team_members tm where tm.team_id=p_team_id and tm.user_id=auth.uid()) then
    raise exception 'Team membership required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',tm.user_id,'xp',public.xp_points_for_user(tm.user_id,p_team_id)) order by public.xp_points_for_user(tm.user_id,p_team_id) desc)
    from public.team_members tm where tm.team_id=p_team_id), '[]'::jsonb);
end;
$$;

create or replace function public.claim_xp_reward(p_reward_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_user uuid := auth.uid(); v_reward public.xp_rewards%rowtype; v_settings public.xp_reward_settings%rowtype; v_xp bigint; v_claim public.xp_reward_claims%rowtype; v_inserted integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_reward from public.xp_rewards where id=p_reward_id and active;
  if not found then raise exception 'Reward is not available'; end if;
  select * into v_settings from public.xp_reward_settings where id=1;
  if v_reward.scope='global' then
    if not v_settings.global_enabled then raise exception 'Global rewards are currently disabled'; end if;
    v_xp := public.xp_points_for_user(v_user, null);
  else
    if not v_settings.team_enabled then raise exception 'Team rewards are currently disabled'; end if;
    if p_team_id is null or p_team_id <> v_reward.team_id or not exists (select 1 from public.team_members tm where tm.team_id=v_reward.team_id and tm.user_id=v_user) then
      raise exception 'You are not eligible for this team reward';
    end if;
    v_xp := public.xp_points_for_user(v_user, v_reward.team_id);
  end if;
  if v_xp < v_reward.xp_required then raise exception 'You need % XP to claim this reward; your current balance is % XP',v_reward.xp_required,v_xp; end if;
  insert into public.xp_reward_claims(reward_id,user_id) values (v_reward.id,v_user) on conflict (reward_id,user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then raise exception 'You have already claimed this reward'; end if;
  select * into v_claim from public.xp_reward_claims where reward_id=v_reward.id and user_id=v_user;
  return jsonb_build_object('id',v_claim.id,'status',v_claim.status,'claimed_at',v_claim.claimed_at);
end;
$$;

create or replace function public.admin_get_xp_rewards()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_settings public.xp_reward_settings%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  select * into v_settings from public.xp_reward_settings where id=1;
  return jsonb_build_object(
    'settings',to_jsonb(v_settings),
    'rewards',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'scope',r.scope,'team_id',r.team_id,'team_name',t.name,'title',r.title,'description',r.description,'xp_required',r.xp_required,'reward_type',r.reward_type,'reward_details',r.reward_details,'active',r.active,'created_at',r.created_at) order by r.scope,r.xp_required)
      from public.xp_rewards r left join public.teams t on t.id=r.team_id),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'reward_id',c.reward_id,'user_id',c.user_id,'user_name',p.display_name,'status',c.status,'claimed_at',c.claimed_at,'reviewed_at',c.reviewed_at,'review_note',c.review_note,'reward_title',r.title,'scope',r.scope,'team_name',t.name) order by c.claimed_at desc)
      from public.xp_reward_claims c join public.profiles p on p.id=c.user_id join public.xp_rewards r on r.id=c.reward_id left join public.teams t on t.id=r.team_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_xp_reward_settings(p_global_enabled boolean, p_team_enabled boolean, p_lesson_xp integer, p_quiz_xp_per_ten_percent integer)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_row public.xp_reward_settings%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_lesson_xp < 0 or p_lesson_xp > 1000 or p_quiz_xp_per_ten_percent < 0 or p_quiz_xp_per_ten_percent > 100 then raise exception 'XP settings are outside allowed limits'; end if;
  update public.xp_reward_settings set global_enabled=p_global_enabled,team_enabled=p_team_enabled,lesson_xp=p_lesson_xp,quiz_xp_per_ten_percent=p_quiz_xp_per_ten_percent,updated_by=auth.uid(),updated_at=now() where id=1 returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_save_xp_reward(p_id uuid, p_scope text, p_team_id uuid, p_title text, p_description text, p_xp_required integer, p_reward_type text, p_reward_details text, p_active boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_row public.xp_rewards%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_scope not in ('global','team') or (p_scope='global' and p_team_id is not null) or (p_scope='team' and p_team_id is null) then raise exception 'Invalid reward scope'; end if;
  if p_title is null or char_length(trim(p_title)) < 2 or char_length(trim(p_title)) > 100 or p_xp_required is null or p_xp_required < 1 then raise exception 'Enter a reward title and positive XP threshold'; end if;
  if p_scope='team' and not exists (select 1 from public.teams where id=p_team_id) then raise exception 'Team not found'; end if;
  if p_id is null then
    insert into public.xp_rewards(scope,team_id,title,description,xp_required,reward_type,reward_details,active,created_by)
    values(p_scope,p_team_id,trim(p_title),coalesce(p_description,''),p_xp_required,p_reward_type,coalesce(p_reward_details,''),coalesce(p_active,true),auth.uid()) returning * into v_row;
  else
    update public.xp_rewards set scope=p_scope,team_id=p_team_id,title=trim(p_title),description=coalesce(p_description,''),xp_required=p_xp_required,reward_type=p_reward_type,reward_details=coalesce(p_reward_details,''),active=coalesce(p_active,true),updated_at=now()
    where id=p_id returning * into v_row;
    if not found then raise exception 'Reward not found'; end if;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_delete_xp_reward(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if exists(select 1 from public.xp_reward_claims where reward_id=p_id) then
    update public.xp_rewards set active=false,updated_at=now() where id=p_id;
  else
    delete from public.xp_rewards where id=p_id;
  end if;
end;
$$;

create or replace function public.admin_review_xp_reward_claim(p_claim_id uuid, p_status text, p_note text default '')
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_row public.xp_reward_claims%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_status not in ('approved','rejected','fulfilled') then raise exception 'Invalid claim status'; end if;
  update public.xp_reward_claims set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(coalesce(p_note,''),1000)
  where id=p_claim_id returning * into v_row;
  if not found then raise exception 'Claim not found'; end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_xp_reward_center(uuid) from public, anon;
revoke all on function public.get_xp_team_leaderboard(uuid) from public, anon;
revoke all on function public.claim_xp_reward(uuid,uuid) from public, anon;
revoke all on function public.admin_get_xp_rewards() from public, anon;
revoke all on function public.admin_update_xp_reward_settings(boolean,boolean,integer,integer) from public, anon;
revoke all on function public.admin_save_xp_reward(uuid,text,uuid,text,text,integer,text,text,boolean) from public, anon;
revoke all on function public.admin_delete_xp_reward(uuid) from public, anon;
revoke all on function public.admin_review_xp_reward_claim(uuid,text,text) from public, anon;

grant execute on function public.get_xp_reward_center(uuid) to authenticated;
grant execute on function public.get_xp_team_leaderboard(uuid) to authenticated;
grant execute on function public.claim_xp_reward(uuid,uuid) to authenticated;
grant execute on function public.admin_get_xp_rewards() to authenticated;
grant execute on function public.admin_update_xp_reward_settings(boolean,boolean,integer,integer) to authenticated;
grant execute on function public.admin_save_xp_reward(uuid,text,uuid,text,text,integer,text,text,boolean) to authenticated;
grant execute on function public.admin_delete_xp_reward(uuid) to authenticated;
grant execute on function public.admin_review_xp_reward_claim(uuid,text,text) to authenticated;
