-- ============================================================================
-- Huzaifa Usman: daily LinkedIn auto-poster, Supabase schema.
-- Replace <SUPABASE_URL> and <CRON_SECRET> in the pg_cron block before running.
-- <CRON_SECRET> must equal the CRON_SECRET function secret.
-- ============================================================================

-- 1) Private bucket for post images (the function reads it with the service role)
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', false)
on conflict (id) do nothing;

-- 2) The queue: one row per post. image_path null = text-only post.
create table if not exists public.scheduled_posts (
  id               bigint generated always as identity primary key,
  day              int,
  image_path       text,
  caption          text not null,
  scheduled_for    timestamptz not null,
  status           text not null default 'pending'
                     check (status in ('pending','processing','posted','failed','skipped')),
  attempts         int not null default 0,
  linkedin_post_id text,
  error            text,
  posted_at        timestamptz,
  claimed_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts (status, scheduled_for);

-- 3) LinkedIn OAuth tokens, single row (id = 1), written by scripts/linkedin-oauth.mjs
create table if not exists public.linkedin_auth (
  id            int primary key default 1 check (id = 1),
  member_urn    text not null,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

-- 4) RLS on, no policies: only the service role can read or write.
alter table public.scheduled_posts enable row level security;
alter table public.linkedin_auth  enable row level security;

-- 5) 04:00 UTC every day = 09:00 Asia/Karachi (PKT is UTC+5, no DST).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('huzaifa-daily-linkedin-post')
  where exists (select 1 from cron.job where jobname = 'huzaifa-daily-linkedin-post');

select cron.schedule(
  'huzaifa-daily-linkedin-post',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := '<SUPABASE_URL>/functions/v1/post-to-linkedin',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful:
--   select id, status, scheduled_for, posted_at, error from scheduled_posts order by scheduled_for;
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
