-- Supabase exposes the public schema through its Data API (PostgREST / GraphQL) to the `anon` and
-- `authenticated` roles. This app doesn't use it: both apps connect as `postgres` (which bypasses
-- RLS) and authorize every request in server code (Better Auth sessions, not Supabase Auth, so
-- `auth.uid()` is never set). RLS with no policies already hides every row from those roles; this
-- also removes their table privileges, including TRUNCATE (which RLS does not filter), and stops
-- tables created later by `postgres` from receiving them by default. Skipped where the Supabase
-- roles don't exist (plain local Postgres).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
