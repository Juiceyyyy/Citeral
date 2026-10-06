-- Reconcile production security drift with the canonical scoped-knowledge model.

drop policy if exists kbd_insert_private on public.knowledge_base_documents;
drop policy if exists kbd_delete_private on public.knowledge_base_documents;

-- Reservations are an RPC-only implementation detail. The SECURITY DEFINER
-- reservation functions validate auth.uid(), size, path and ownership, so client
-- roles do not need direct table privileges.
revoke all on table public.knowledge_upload_reservations from anon, authenticated;

drop policy if exists knowledge_upload_reservations_deny_direct on public.knowledge_upload_reservations;
create policy knowledge_upload_reservations_deny_direct
on public.knowledge_upload_reservations
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.knowledge_upload_reservations is
  'RPC-only upload quota reservations. Direct anon/authenticated table access is denied; use reserve_knowledge_upload and claim_knowledge_upload_reservation.';
