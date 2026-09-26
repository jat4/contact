create or replace function public.notify_application_message_realtime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'message_id', new.id,
      'application_id', new.application_id
    ),
    'message_created',
    'application:' || new.application_id::text,
    false
  );

  return new;
end;
$$;

revoke all on function public.notify_application_message_realtime() from public, anon, authenticated;

drop trigger if exists messages_realtime_broadcast on public.messages;

create trigger messages_realtime_broadcast
after insert on public.messages
for each row
execute function public.notify_application_message_realtime();
