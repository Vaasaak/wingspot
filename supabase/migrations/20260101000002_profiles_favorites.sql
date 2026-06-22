-- Profily uživatelů (oblíbené spoty) + automatické vytvoření při registraci.

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  favorites  text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "own profile read" on profiles;
create policy "own profile read" on profiles for select using (auth.uid() = id);

drop policy if exists "own profile upsert" on profiles;
create policy "own profile upsert" on profiles for insert with check (auth.uid() = id);

drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
