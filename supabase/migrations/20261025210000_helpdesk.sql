create table if not exists public.helpdesk_settings (
  id integer primary key default 1 check (id=1),
  floating_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.helpdesk_settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.helpdesk_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sender_email text not null,
  sender_name text,
  subject text not null default 'LearningBeyond Help Desk',
  message text not null,
  created_at timestamptz not null default now(),
  email_status text not null default 'pending' check(email_status in ('pending','sent','failed'))
);
alter table public.helpdesk_settings enable row level security;
alter table public.helpdesk_messages enable row level security;
revoke all on public.helpdesk_settings from anon, authenticated;
revoke all on public.helpdesk_messages from anon, authenticated;
create or replace function public.get_helpdesk_settings()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('floating_enabled', floating_enabled) from public.helpdesk_settings where id=1
$$;
revoke all on function public.get_helpdesk_settings() from public, anon;
grant execute on function public.get_helpdesk_settings() to authenticated;
create or replace function public.admin_set_helpdesk_visibility(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not public.is_platform_admin() then raise exception 'Platform admin access required'; end if;
 update public.helpdesk_settings set floating_enabled=p_enabled,updated_by=auth.uid(),updated_at=now() where id=1;
 return jsonb_build_object('floating_enabled',p_enabled);
end; $$;
revoke all on function public.admin_set_helpdesk_visibility(boolean) from public,anon;
grant execute on function public.admin_set_helpdesk_visibility(boolean) to authenticated;
