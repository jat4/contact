-- Generate new application numbers as exactly 8 numeric digits.
-- Existing application numbers are preserved; this applies to new applications only.

create or replace function public.generate_application_number()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  candidate text;
begin
  if new.application_number is null or new.application_number = '' then
    loop
      candidate := lpad((floor(random() * 90000000) + 10000000)::bigint::text, 8, '0');
      exit when not exists (
        select 1
        from public.applications
        where application_number = candidate
      );
    end loop;

    new.application_number := candidate;
  end if;

  return new;
end;
$$;

revoke all on function public.generate_application_number() from public, anon, authenticated;
