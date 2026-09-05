-- Achiever Board — Supabase schema
-- Run this once in the Supabase Dashboard: SQL Editor → New query → paste → Run.
-- Replaces the old Firebase Realtime Database ("spaces/...") with real
-- accounts (Supabase Auth) + Postgres tables protected by Row Level Security,
-- so a board is only ever readable/writable by the account that owns it.

create extension if not exists pgcrypto;

-- ─── Boards ───────────────────────────────────────────────────────────────
-- One board per account today (auto-created on signup by the trigger below).
create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default 'My Board',
  created_at timestamptz not null default now()
);

-- ─── Tasks ────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  board_id            uuid not null references public.boards(id) on delete cascade,
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  board_id     uuid not null references public.boards(id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_email text,
  text         text not null,
  created_at   timestamptz not null default now()
);

-- ─── Notifications ────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tasks_board_id_idx         on public.tasks(board_id);
create index if not exists comments_task_id_idx       on public.comments(task_id);
create index if not exists comments_board_id_idx      on public.comments(board_id);
create index if not exists notifications_board_id_idx on public.notifications(board_id);
create index if not exists boards_owner_id_idx        on public.boards(owner_id);

-- ─── Row Level Security ───────────────────────────────────────────────────
-- Every table is scoped to owner_id = auth.uid() — the logged-in account.
-- Nobody, including other authenticated users, can read or write a row they
-- don't own. There is no anon access at all.
alter table public.boards        enable row level security;
alter table public.tasks         enable row level security;
alter table public.comments      enable row level security;
alter table public.notifications enable row level security;

create policy "boards_owner_all" on public.boards
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "tasks_owner_all" on public.tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "comments_owner_all" on public.comments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "notifications_owner_all" on public.notifications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ─── Realtime ─────────────────────────────────────────────────────────────
-- Lets the browser subscribe to live INSERT/UPDATE/DELETE events instead of
-- polling — this is what replaces Firebase's onValue() listeners.
alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;

-- ─── Auto-create a default board when someone signs up ───────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.boards (owner_id, name) values (new.id, 'My Board');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Storage: task attachments ────────────────────────────────────────────
-- Files are uploaded straight from the browser to a path prefixed with the
-- owner's user id (<uid>/<file>), and RLS on storage.objects enforces that
-- only that owner can write or delete under their own prefix. Reads are
-- public so attachment links/previews work without extra signed-URL plumbing.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', true)
on conflict (id) do nothing;

create policy "task_attachments_public_read" on storage.objects
  for select using (bucket_id = 'task-attachments');

create policy "task_attachments_owner_write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "task_attachments_owner_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
