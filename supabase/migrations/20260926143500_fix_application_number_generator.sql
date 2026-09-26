create or replace function public.generate_application_number()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.application_number is null or new.application_number='' then
    new.application_number =
      'APP-' ||
      to_char(coalesce(new.created_at, now()), 'YYYYMMDD') ||
      '-' ||
      upper(encode(extensions.gen_random_bytes(4), 'hex'));
  end if;
  return new;
end;
$$;

revoke all on function public.generate_application_number() from public, anon, authenticated;
