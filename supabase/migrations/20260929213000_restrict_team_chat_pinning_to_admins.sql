create or replace function public.prevent_member_chat_pinning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_team_admin(new.team_id)
     and (
       new.pinned_at is distinct from old.pinned_at
       or new.pinned_by is distinct from old.pinned_by
     ) then
    raise exception 'Only team admins can pin or unpin messages';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_team_chat_pinning_admin_only on public.team_chat_messages;

create trigger enforce_team_chat_pinning_admin_only
before update on public.team_chat_messages
for each row
execute function public.prevent_member_chat_pinning();
