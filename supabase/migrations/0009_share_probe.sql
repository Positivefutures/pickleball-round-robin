-- ============================================================================
-- 0009_share_probe.sql
--
-- One cheap question a watching phone can ask often: has this session changed?
--
-- Run it once, whole, in the Supabase SQL Editor. Unlike 0006 and 0008 the
-- ordering is free: the client that goes with this falls back to the polling it
-- does today if the function is not there, so it is safe to deploy either side
-- of this migration. What it will not do is get faster until this has run.
--
-- Why it exists. A watcher's page polls shared_session() every twenty seconds,
-- and every one of those calls returns the whole session document — around
-- 8KB for twelve players over eight rounds. Twenty seconds is not a cadence
-- anybody chose; it is what the size of that document forced. It is also what
-- made the host's round timer take about twelve seconds to appear on everybody
-- else's phone: a second and a half for the host to publish, and then up to
-- twenty more before anyone asked.
--
-- So the question is split in two. This function returns one timestamp, which
-- is tens of bytes rather than thousands, and the page asks it every three
-- seconds. Only when the answer moves does it fetch the document. The timer
-- lands in about three seconds instead of twelve, and a session with eight
-- people watching moves LESS data than it does today, because the eight of them
-- spend the afternoon exchanging timestamps rather than schedules.
--
-- Everything about how it answers is copied from shared_session() deliberately:
-- security definer over a table anon cannot read, the same expiry test, and
-- null for a key that never existed, one that has expired and one that was
-- stopped. Three endings that must stay indistinguishable, or this becomes the
-- cheap oracle for working through the key space that shared_session refuses
-- to be. It is cheaper to call than shared_session, which is the whole point,
-- and that makes keeping the three endings identical matter more here, not
-- less.
--
-- updated_at rather than server_updated_at: it is set from the `at` on the
-- document itself, so the caller can compare what it gets here against the
-- snapshot already in its hands without holding a second timestamp for the
-- purpose. server_updated_at is the trigger's own record of when the row was
-- written and is nobody's business outside the database.
-- ============================================================================

create or replace function public.shared_session_at(key text)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select s.updated_at
  from public.shared_sessions s
  where s.share_key = key
    and s.expires_at > now();
$$;

-- Postgres grants EXECUTE to PUBLIC on a new function, so the revoke is doing
-- real work. This and shared_session() are now the entire public surface of the
-- database, and they answer the same question at two levels of detail.
revoke all on function public.shared_session_at(text) from public;
grant execute on function public.shared_session_at(text) to anon, authenticated;
