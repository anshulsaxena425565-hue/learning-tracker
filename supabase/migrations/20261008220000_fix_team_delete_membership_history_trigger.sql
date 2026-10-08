CREATE OR REPLACE FUNCTION public.log_team_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op='INSERT' then
    insert into public.team_membership_history(team_id,user_id,role,action,changed_by)
    values(new.team_id,new.user_id,new.role,'joined',auth.uid());
    return new;
  elsif tg_op='UPDATE' then
    if old.role is distinct from new.role then
      insert into public.team_membership_history(team_id,user_id,role,action,changed_by)
      values(new.team_id,new.user_id,new.role,'role_changed',auth.uid());
    end if;
    return new;
  else
    -- Team deletion cascades into team_members after the parent team row is
    -- no longer visible to the FK, so don't write a history row in that case.
    -- Normal member removal still records the leave event.
    if exists (select 1 from public.teams where id=old.team_id) then
      insert into public.team_membership_history(team_id,user_id,role,action,changed_by)
      values(old.team_id,old.user_id,old.role,'left',auth.uid());
    end if;
    return old;
  end if;
end;
$function$;
