-- Security: stop anonymous/authenticated clients from reading every user's
-- email address. The profiles SELECT policy is USING(true) (public identity
-- info is a feature), but RLS is row-level — it cannot hide columns, and the
-- table-level SELECT grant exposed email + unsubscribe_token to anyone holding
-- the public anon key.
--
-- Postgres privileges are additive: a column-level REVOKE is a no-op while a
-- table-level grant exists. So: revoke table SELECT, grant back only the
-- public columns. Service-role (server code) keeps full access; every
-- client-context reader has been converted to explicit column lists.
-- email_preferences stays granted: the account page edits the user's own
-- prefs from the browser, and the values are non-sensitive booleans.
REVOKE SELECT ON profiles FROM anon, authenticated;
GRANT SELECT (id, role, full_name, avatar_url, created_at, updated_at, email_preferences)
  ON profiles TO anon, authenticated;

-- Security: conversation membership was mutable by either participant — the
-- UPDATE policy row-checks membership but nothing froze the membership
-- COLUMNS, so a participant could reassign participant_two and hand the whole
-- private thread (messages RLS is membership-based) to any account. Freeze
-- both participant columns for non-privileged callers, mirroring
-- guard_messages_update. context_id/context_type stay mutable: the
-- commissions route legitimately stamps context_id under the user's session.
CREATE OR REPLACE FUNCTION guard_conversations_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.participant_one := OLD.participant_one;
    NEW.participant_two := OLD.participant_two;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS conversations_update_guard ON conversations;
CREATE TRIGGER conversations_update_guard BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION guard_conversations_update();
