-- Adds the sales_rep column to shops, and a safe view exposing just id + email from
-- auth.users so the Shop DB's sales-rep dropdown can be sourced from real registered
-- accounts without needing admin/service-role access.

alter table shops add column if not exists sales_rep text;

create or replace view public.user_directory as
select id, email from auth.users order by email;

grant select on public.user_directory to authenticated;
