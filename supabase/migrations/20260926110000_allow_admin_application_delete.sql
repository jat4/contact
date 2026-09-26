-- Allow authorized admins to permanently delete applications.
-- messages are removed automatically by the existing ON DELETE CASCADE foreign key.

grant delete on table public.applications to authenticated;

create policy "Admins can delete applications"
on public.applications
for delete
to authenticated
using ((select private.is_admin()));
