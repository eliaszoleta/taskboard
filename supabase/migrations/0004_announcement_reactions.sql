-- Achiever Board — Announcement reactions
-- Run this in the Supabase SQL Editor AFTER 0001-0003.
-- Facebook-style emoji reactions on team announcements: one reaction per
-- person per announcement (picking a different emoji replaces it; clicking
-- your current one again removes it — both handled client-side).

create table if not exists public.team_announcement_reactions (
  announcement_id uuid not null references public.team_announcements(id) on delete cascade,
  team_id         uuid not null references public.teams(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  emoji           text not null,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists team_anno_reactions_announcement_id_idx on public.team_announcement_reactions(announcement_id);

alter table public.team_announcement_reactions enable row level security;

-- Any team member can see who reacted with what. You can only ever
-- create/change/remove your OWN reaction — never anyone else's.
create policy "team_anno_reactions_member_select" on public.team_announcement_reactions
  for select using (public.is_team_member(team_id));

create policy "team_anno_reactions_self_insert" on public.team_announcement_reactions
  for insert with check (public.is_team_member(team_id) and user_id = auth.uid());

create policy "team_anno_reactions_self_update" on public.team_announcement_reactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "team_anno_reactions_self_delete" on public.team_announcement_reactions
  for delete using (user_id = auth.uid());

alter publication supabase_realtime add table public.team_announcement_reactions;
