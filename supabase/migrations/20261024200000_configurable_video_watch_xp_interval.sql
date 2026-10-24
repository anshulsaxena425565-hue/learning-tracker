-- Make course video watch XP interval-based (e.g. 1 XP per 30 or 60 seconds).
alter table public.xp_reward_settings
  add column if not exists watch_xp_per_interval integer not null default 1
    check (watch_xp_per_interval between 0 and 100),
  add column if not exists watch_interval_seconds integer not null default 60
    check (watch_interval_seconds in (30, 60));

update public.xp_reward_settings
set watch_xp_per_interval = coalesce(watch_xp_per_interval, watch_xp_per_minute, 1),
    watch_interval_seconds = coalesce(watch_interval_seconds, 60)
where id = 1;

create or replace function public.xp_points_for_user(p_user_id uuid, p_team_id uuid default null)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select
    coalesce((
      select floor(coalesce(sum(greatest(vp.watched_seconds,0)),0)::numeric / greatest(s.watch_interval_seconds,1))::bigint * s.watch_xp_per_interval
      from public.video_progress vp
      join public.playlist_videos pv on pv.id = vp.playlist_video_id
      join public.playlists pl on pl.id = pv.playlist_id
      cross join public.xp_reward_settings s
      where vp.user_id = p_user_id
        and (p_team_id is null or pl.team_id = p_team_id)
      group by s.watch_interval_seconds, s.watch_xp_per_interval
    ), 0)
    + coalesce((
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
    + coalesce((
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

create or replace function public.admin_update_xp_reward_settings(
  p_global_enabled boolean,
  p_team_enabled boolean,
  p_lesson_xp integer,
  p_quiz_xp_per_ten_percent integer,
  p_watch_xp_per_interval integer,
  p_watch_interval_seconds integer,
  p_show_user_panel boolean
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_row public.xp_reward_settings%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
  if p_lesson_xp < 0 or p_lesson_xp > 1000
     or p_quiz_xp_per_ten_percent < 0 or p_quiz_xp_per_ten_percent > 100
     or p_watch_xp_per_interval < 0 or p_watch_xp_per_interval > 100
     or p_watch_interval_seconds not in (30,60) then
    raise exception 'XP settings are outside allowed limits';
  end if;
  update public.xp_reward_settings
  set global_enabled=p_global_enabled,
      team_enabled=p_team_enabled,
      lesson_xp=p_lesson_xp,
      quiz_xp_per_ten_percent=p_quiz_xp_per_ten_percent,
      watch_xp_per_minute=p_watch_xp_per_interval,
      watch_xp_per_interval=p_watch_xp_per_interval,
      watch_interval_seconds=p_watch_interval_seconds,
      show_user_panel=p_show_user_panel,
      updated_by=auth.uid(),
      updated_at=now()
  where id=1 returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.admin_update_xp_reward_settings(boolean,boolean,integer,integer,integer,integer,boolean) from public, anon;
grant execute on function public.admin_update_xp_reward_settings(boolean,boolean,integer,integer,integer,integer,boolean) to authenticated;
