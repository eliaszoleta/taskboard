-- Achiever Board — Team Board schema
-- Run this in the Supabase SQL Editor AFTER 0001_init.sql.
-- Replaces /team/'s old Firebase model (client-hashed passwords stored in a
-- publicly-readable database, no real auth at all) with real Supabase Auth
-- accounts + a team_members join table, all gated by Row Level Security.

-- ─── Teams ────────────────────────────────────────────────────────────────
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  max_users   int not null default 2,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ─── Team membership ──────────────────────────────────────────────────────
create table if not exists public.team_members (
  team_id      uuid not null references public.teams(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null default 'member' check (role in ('admin','member')),
  photo_url    text,
  joined_at    timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ─── Membership helper functions ──────────────────────────────────────────
-- security definer + owned by the table owner => these bypass RLS internally,
-- which is what avoids infinite recursion when team_members' own policies
-- call is_team_member() to check membership of team_members itself.
create or replace function public.is_team_member(_team_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_members where team_id = _team_id and user_id = _user_id);
$$;

create or replace function public.is_team_admin(_team_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_members where team_id = _team_id and user_id = _user_id and role = 'admin');
$$;

-- ─── Controlled entry points for joining a team ───────────────────────────
-- Client code never inserts into team_members directly — only through these
-- two functions, so "add yourself to a team" can never become "add anyone
-- to any team."
create or replace function public.create_team(_name text, _display_name text, _max_users int default 2)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  _code text;
  _team public.teams;
begin
  _code := encode(gen_random_bytes(6), 'hex');
  insert into public.teams (name, invite_code, max_users, created_by)
    values (_name, _code, _max_users, auth.uid())
    returning * into _team;
  insert into public.team_members (team_id, user_id, display_name, role)
    values (_team.id, auth.uid(), _display_name, 'admin');
  return _team;
end;
$$;

create or replace function public.redeem_invite_code(_code text, _display_name text)
returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  _team public.teams;
  _member_count int;
begin
  select * into _team from public.teams where invite_code = _code;
  if _team.id is null then
    raise exception 'Invalid invite code';
  end if;

  if public.is_team_member(_team.id) then
    return _team; -- already a member, no-op
  end if;

  select count(*) into _member_count from public.team_members where team_id = _team.id;
  if _member_count >= _team.max_users then
    raise exception 'This team is full';
  end if;

  insert into public.team_members (team_id, user_id, display_name, role)
    values (_team.id, auth.uid(), _display_name, 'member');
  return _team;
end;
$$;

-- ─── Tasks ────────────────────────────────────────────────────────────────
create table if not exists public.team_tasks (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  created_by          uuid not null references auth.users(id),
  assigned_to         uuid references auth.users(id) on delete set null,
  title               text not null,
  description         text not null default '',
  priority            text not null default 'medium' check (priority in ('low','medium','high')),
  status              text not null default 'todo' check (status in ('todo','inprogress','pending','done')),
  scheduled_for       date,
  due_date            date,
  resources           jsonb not null default '[]'::jsonb,
  overdue_notified_at timestamptz,
  created_at          timestamptz not null default now()
);

-- ─── Comments (task notes) ────────────────────────────────────────────────
create table if not exists public.team_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.team_tasks(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  author_id  uuid not null references auth.users(id),
  text       text not null,
  created_at timestamptz not null default now()
);

-- ─── Notifications ────────────────────────────────────────────────────────
create table if not exists public.team_notifications (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade, -- recipient
  actor_id   uuid references auth.users(id),                            -- who triggered it
  task_id    uuid references public.team_tasks(id) on delete set null,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Direct messages between teammates ────────────────────────────────────
create table if not exists public.team_direct_messages (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  sender_id    uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  text         text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists team_tasks_team_id_idx        on public.team_tasks(team_id);
create index if not exists team_comments_task_id_idx     on public.team_comments(task_id);
create index if not exists team_comments_team_id_idx     on public.team_comments(team_id);
create index if not exists team_notif_team_id_idx        on public.team_notifications(team_id);
create index if not exists team_notif_user_id_idx        on public.team_notifications(user_id);
create index if not exists team_dm_team_id_idx           on public.team_direct_messages(team_id);
create index if not exists team_dm_sender_recipient_idx  on public.team_direct_messages(sender_id, recipient_id);
create index if not exists team_members_user_id_idx      on public.team_members(user_id);

-- ─── Row Level Security ───────────────────────────────────────────────────
alter table public.teams                enable row level security;
alter table public.team_members         enable row level security;
alter table public.team_tasks           enable row level security;
alter table public.team_comments        enable row level security;
alter table public.team_notifications   enable row level security;
alter table public.team_direct_messages enable row level security;

-- Teams: any member can read; only an admin can update (rename, resize); no
-- direct client-side inserts/deletes (creation goes through create_team()).
create policy "teams_member_select" on public.teams
  for select using (public.is_team_member(id));
create policy "teams_admin_update" on public.teams
  for update using (public.is_team_admin(id)) with check (public.is_team_admin(id));

-- Team members: any member of the team can see the roster; an admin can
-- remove members or change roles; members can update only their own
-- display_name/photo_url.
create policy "team_members_select" on public.team_members
  for select using (public.is_team_member(team_id));
create policy "team_members_admin_write" on public.team_members
  for update using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy "team_members_self_update" on public.team_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "team_members_admin_delete" on public.team_members
  for delete using (public.is_team_admin(team_id));
create policy "team_members_self_leave" on public.team_members
  for delete using (user_id = auth.uid());

-- Tasks / comments: any team member can read and write.
create policy "team_tasks_member_all" on public.team_tasks
  for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy "team_comments_member_all" on public.team_comments
  for all using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));

-- Notifications: you can only ever see/update your own inbox. Any fellow
-- team member can create a notification addressed to you (e.g. on
-- assignment or completion), but never on someone else's behalf as sender,
-- and never for a team you're not both in.
create policy "team_notif_select_own" on public.team_notifications
  for select using (user_id = auth.uid());
create policy "team_notif_update_own" on public.team_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "team_notif_insert_teammate" on public.team_notifications
  for insert with check (
    public.is_team_member(team_id)
    and public.is_team_member(team_id, user_id)
  );

-- Direct messages: only the two participants can read; only the sender (who
-- must actually be themself and a team member) can insert; recipient can
-- mark read via update.
create policy "team_dm_select_participant" on public.team_direct_messages
  for select using (auth.uid() in (sender_id, recipient_id));
create policy "team_dm_insert_sender" on public.team_direct_messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_team_member(team_id, sender_id)
    and public.is_team_member(team_id, recipient_id)
  );
create policy "team_dm_update_recipient" on public.team_direct_messages
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ─── Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.team_members;
alter publication supabase_realtime add table public.team_tasks;
alter publication supabase_realtime add table public.team_comments;
alter publication supabase_realtime add table public.team_notifications;
alter publication supabase_realtime add table public.team_direct_messages;

-- ─── Storage: avatars ─────────────────────────────────────────────────────
-- Task attachments for team boards reuse the existing 'task-attachments'
-- bucket/policies from 0001_init.sql (same owner-prefixed path scheme).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_owner_write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
