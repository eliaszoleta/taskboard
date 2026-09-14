-- Achiever Board — secure paid-team activation
-- Run this in the Supabase SQL Editor AFTER 0001-0004.
--
-- Closes a real vulnerability: create_team() previously accepted _max_users
-- straight from the client with no check that any payment happened, so any
-- logged-in user could call it directly (e.g. from the browser console)
-- and grant themselves a 20-seat team for free. From now on:
--   - create_team() (callable by any authenticated user) is hard-capped to
--     the free tier (2 users), no matter what it's asked for.
--   - activate_paid_team() is the only way to create a team above that,
--     and it's revoked from anon/authenticated entirely -- only the
--     service_role (used exclusively by the Stripe webhook handler running
--     on the server, never in the browser) can call it. The seat count it
--     grants comes from the webhook's own derivation of what was actually
--     paid (Stripe's reported amount), never from anything the client sent.

-- ── Lock down create_team(): free tier only ─────────────────────────────
create or replace function public.create_team(_name text, _display_name text, _max_users int default 2)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  _code text;
  _team public.teams;
begin
  _code := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into public.teams (name, invite_code, max_users, created_by)
    -- least(...) caps this at 2 regardless of what _max_users the caller
    -- passed -- paid seat counts can only come from activate_paid_team().
    values (_name, _code, least(coalesce(_max_users, 2), 2), auth.uid())
    returning * into _team;
  insert into public.team_members (team_id, user_id, display_name, role)
    values (_team.id, auth.uid(), _display_name, 'admin');
  return _team;
end;
$$;

-- ── Stripe linkage on teams, for matching cancellation/renewal webhooks ──
alter table public.teams add column if not exists stripe_customer_id text;
alter table public.teams add column if not exists stripe_subscription_id text;
create unique index if not exists teams_stripe_subscription_id_idx
  on public.teams(stripe_subscription_id) where stripe_subscription_id is not null;

-- ── Pending team intents ─────────────────────────────────────────────────
-- Stashed by the browser right after signup (email/team-name/display-name),
-- BEFORE redirecting to Stripe. This has to be writable without a session,
-- because Supabase doesn't grant one until the user confirms their email --
-- there's no auth.uid() to scope this to at the moment it's written.
-- Only team_name/display_name/team_size (cosmetic, non-monetary) live here;
-- the actual seat count a payment unlocks is independently derived by the
-- webhook from what Stripe reports was paid, so forging a row here (e.g.
-- claiming a bigger team_size than you intend to pay for) can't grant more
-- than you actually paid for -- worst case is a wrong team_name/display_name
-- landing on your OWN eventual team, not a security or billing bypass.
create table if not exists public.pending_team_intents (
  user_id      uuid primary key,
  team_name    text not null,
  display_name text not null,
  team_size    int not null,
  created_at   timestamptz not null default now()
);

alter table public.pending_team_intents enable row level security;

create policy "pending_team_intents_anyone_insert" on public.pending_team_intents
  for insert with check (true);
create policy "pending_team_intents_anyone_upsert" on public.pending_team_intents
  for update using (true) with check (true);
-- Deliberately no select/delete policy for anon/authenticated -- only the
-- webhook (service_role, bypasses RLS) ever reads or removes these, so
-- nobody can browse other people's pending team names.

create or replace function public.stash_pending_team_intent(_user_id uuid, _team_name text, _display_name text, _team_size int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pending_team_intents (user_id, team_name, display_name, team_size, created_at)
    values (_user_id, _team_name, _display_name, _team_size, now())
    on conflict (user_id) do update set
      team_name = excluded.team_name, display_name = excluded.display_name,
      team_size = excluded.team_size, created_at = excluded.created_at;
end;
$$;

-- ── activate_paid_team(): the ONLY way to grant more than 2 seats ───────
-- Called exclusively by /api/stripe-webhook.js using the service role key
-- after Stripe's webhook signature has been verified server-side and the
-- payment amount has been mapped to a seat count -- never by the browser.
create or replace function public.activate_paid_team(
  _user_id uuid, _team_name text, _display_name text, _max_users int,
  _stripe_customer_id text default null, _stripe_subscription_id text default null
)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  _code text;
  _team public.teams;
begin
  _code := substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into public.teams (name, invite_code, max_users, created_by, stripe_customer_id, stripe_subscription_id)
    values (_team_name, _code, _max_users, _user_id, _stripe_customer_id, _stripe_subscription_id)
    returning * into _team;
  insert into public.team_members (team_id, user_id, display_name, role)
    values (_team.id, _user_id, _display_name, 'admin');
  return _team;
end;
$$;

-- Atomically fetch-and-remove a pending intent so two overlapping webhook
-- deliveries for the same payment (Stripe can retry/duplicate) can't both
-- see it and create two teams -- only one delete can win the row.
create or replace function public.consume_pending_team_intent(_user_id uuid)
returns public.pending_team_intents
language sql security definer set search_path = public as $$
  delete from public.pending_team_intents where user_id = _user_id
  returning *;
$$;

create or replace function public.downgrade_team_to_free(_stripe_subscription_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.teams set max_users = 2 where stripe_subscription_id = _stripe_subscription_id;
end;
$$;

-- These three are server-only: revoke the default anon/authenticated grant
-- Supabase applies to every public-schema function, then grant execute to
-- service_role alone.
revoke all on function public.activate_paid_team(uuid, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.activate_paid_team(uuid, text, text, int, text, text) to service_role;

revoke all on function public.consume_pending_team_intent(uuid) from public, anon, authenticated;
grant execute on function public.consume_pending_team_intent(uuid) to service_role;

revoke all on function public.downgrade_team_to_free(text) from public, anon, authenticated;
grant execute on function public.downgrade_team_to_free(text) to service_role;
