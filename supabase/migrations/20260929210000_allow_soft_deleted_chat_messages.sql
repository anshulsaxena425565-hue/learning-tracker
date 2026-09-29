alter table public.team_chat_messages
drop constraint if exists team_chat_messages_content_check;

alter table public.team_chat_messages
add constraint team_chat_messages_content_check
check (
  deleted_at is not null
  or (
    char_length(trim(content)) >= 1
    and char_length(trim(content)) <= 2000
  )
);
