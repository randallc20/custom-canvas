-- Fixes a P0 and a P1 from the auth review pass r4 (docs/reviews/01-auth-access-r4.md).
--
-- (1) `dmca_substantiated_count()` was callable with the public anon key.
--     Postgres grants EXECUTE to PUBLIC on every new function, and 00065's
--     `REVOKE ... FROM anon, authenticated` does not remove a privilege those
--     roles hold via PUBLIC — so the revoke was a no-op. The function is
--     SECURITY DEFINER, so it reads past the admin-only RLS policy: anyone
--     could POST /rest/v1/rpc/dmca_substantiated_count with any profile id and
--     score the entire public artist directory for copyright accusations. The
--     count is exactly the fact the table was made admin-only to protect.
--
--     Every other function in the schema already gets this right (00051 and
--     00052 revoke FROM PUBLIC); 00065 was the one that named the two roles
--     and omitted PUBLIC. db-smoke now asserts it for EVERY SECURITY DEFINER
--     function rather than for this one, because the class is what matters.
--
-- (2) "Remove material" hid the listing row and left the file serving from a
--     PUBLIC bucket. §512(c)(1)(C) asks for the material to be removed or
--     access to it disabled, and hiding the row that links to it does neither
--     — the claimant re-checks the very URL they sent us and the work is
--     still there. A private quarantine bucket lets the removal actually
--     disable access while keeping the counter-notice restore path real.

REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM anon, authenticated;

-- Private. Nothing but the service role touches it: an object here is
-- material somebody has claimed is infringing, held only so a successful
-- counter-notice can put it back.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dmca-quarantine', 'dmca-quarantine', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- No policies at all, deliberately: with RLS on and no policy, anon and
-- authenticated can do nothing, and the service role bypasses RLS. Every
-- other bucket's policies exist to let USERS act; nobody but an admin route
-- ever acts here.
DROP POLICY IF EXISTS "DMCA quarantine is service-role only" ON storage.objects;

-- Where the removed file came from, so the restore can put it back and the
-- record survives even if the listing row is later deleted.
ALTER TABLE dmca_notices
  ADD COLUMN IF NOT EXISTS quarantined_paths TEXT[];

COMMENT ON COLUMN dmca_notices.quarantined_paths IS
  'Storage paths moved into the private dmca-quarantine bucket when the material was removed (00068). The restore action copies them back into listing-images.';
