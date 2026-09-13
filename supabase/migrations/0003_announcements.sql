-- Achiever Board — Team announcements
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql and 0002_teams.sql.
-- Restores the old Firebase build's workspace-wide announcements feed
-- (dropped in the initial Team Board migration) as a proper Supabase table.

create table if not exists public.team_announcements (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  author_id  uuid not null references auth.users(id),
  content    text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index if not exists team_announcements_team_id_idx on public.team_announcements(team_id);

alter table public.team_announcements enable row level security;

-- Any team member can read and post. Editing/deleting is restricted to the
-- announcement's own author or a team admin (matches the old app's
-- "canModify" behavior: author or admin, not just any member).
create policy "team_announcements_member_select" on public.team_announcements
  for select using (public.is_team_member(team_id));

create policy "team_announcements_member_insert" on public.team_announcements
  for insert with check (public.is_team_member(team_id) and author_id = auth.uid());

create policy "team_announcements_author_or_admin_update" on public.team_announcements
  for update using (author_id = auth.uid() or public.is_team_admin(team_id))
             with check (author_id = auth.uid() or public.is_team_admin(team_id));

create policy "team_announcements_author_or_admin_delete" on public.team_announcements
  for delete using (author_id = auth.uid() or public.is_team_admin(team_id));

alter publication supabase_realtime add table public.team_announcements;
