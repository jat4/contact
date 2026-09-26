create extension if not exists pgcrypto;

create schema if not exists private;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  application_number text not null unique,
  name text not null,
  last_name text,
  email text not null,
  mobile_number text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','replied','customer_reply','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer','admin')),
  message text not null,
  created_at timestamptz not null default now()
);

create index applications_last_activity_idx on public.applications(last_activity_at desc);
create index applications_application_number_idx on public.applications(application_number);
create index applications_mobile_idx on public.applications(mobile_number);
create index messages_application_created_idx on public.messages(application_id, created_at);

create function private.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.admin_users where user_id=(select auth.uid())); $$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create function public.set_application_activity()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); new.last_activity_at=now(); return new; end; $$;

revoke all on function public.set_application_activity() from public, anon, authenticated;

create trigger applications_activity_trigger before update on public.applications for each row execute function public.set_application_activity();

create function public.set_message_activity()
returns trigger language plpgsql set search_path=''
as $$ begin update public.applications set last_activity_at=now(),updated_at=now(),status=case when new.sender_type='admin' then 'replied' else 'customer_reply' end where id=new.application_id; return new; end; $$;

revoke all on function public.set_message_activity() from public, anon, authenticated;

create trigger messages_activity_trigger after insert on public.messages for each row execute function public.set_message_activity();

create function public.generate_application_number()
returns trigger language plpgsql set search_path=''
as $$ begin if new.application_number is null or new.application_number='' then new.application_number='APP-'||to_char(coalesce(new.created_at,now()),'YYYYMMDD')||'-'||upper(encode(gen_random_bytes(4),'hex')); end if; return new; end; $$;

revoke all on function public.generate_application_number() from public, anon, authenticated;

create trigger application_number_trigger before insert on public.applications for each row execute function public.generate_application_number();

alter table public.admin_users enable row level security;
alter table public.applications enable row level security;
alter table public.messages enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.applications from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on public.admin_users to authenticated;
grant select on public.applications to authenticated;
grant select,insert on public.messages to authenticated;

create policy "Admins can read their own admin record" on public.admin_users for select to authenticated using ((select auth.uid()));
create policy "Admins can read applications" on public.applications for select to authenticated using ((select private.is_admin()));
create policy "Admins can read messages" on public.messages for select to authenticated using ((select private.is_admin()));
create policy "Admins can send messages" on public.messages for insert to authenticated with check ((select private.is_admin()) and sender_type='admin');

alter publication supabase_realtime add table public.applications;
alter publication supabase_realtime add table public.messages;
