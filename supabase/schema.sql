-- EthnoCode accounts: one saved workspace per user.
-- Run this once in Supabase: Project, SQL Editor, New query, paste, Run.

create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: every user can read and write only their own workspace.
alter table public.workspaces enable row level security;

drop policy if exists "Read own workspace" on public.workspaces;
create policy "Read own workspace" on public.workspaces
  for select using (auth.uid() = user_id);

drop policy if exists "Create own workspace" on public.workspaces;
create policy "Create own workspace" on public.workspaces
  for insert with check (auth.uid() = user_id);

drop policy if exists "Update own workspace" on public.workspaces;
create policy "Update own workspace" on public.workspaces
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Delete own workspace" on public.workspaces;
create policy "Delete own workspace" on public.workspaces
  for delete using (auth.uid() = user_id);
