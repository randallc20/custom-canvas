-- Close the approval-gate's listing leak + hide review columns.
--
-- (1) LISTING VISIBILITY. is_live gated the artist DIRECTORY but no listing
-- surface — a draft/pending artist's 'available' listing appeared in the
-- public feed, /api/listings, the listing detail page, autocomplete, and the
-- sitemap, and was purchasable. Enforce at RLS so every anon/user read path
-- is closed at once: public visibility now requires the OWNING ARTIST to be
-- live. Owner keeps seeing their own listings (Studio); admins keep the
-- 00028 all-listings policy for review.
DROP POLICY IF EXISTS "Listings visible if not hidden or draft" ON listings;
CREATE POLICY "Listings visible if artist live and not hidden or draft" ON listings
  FOR SELECT USING (
    (
      status NOT IN ('hidden', 'draft')
      AND EXISTS (
        SELECT 1 FROM artist_profiles ap
        WHERE ap.id = listings.artist_id AND ap.is_live = true
      )
    )
    OR artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
  );

-- (2) ARTIST_PROFILES COLUMN PRIVACY. rejection_reason (the admin's candid
-- critique), reviewed_by/reviewed_at, and stripe_account_id were readable by
-- anyone via the USING(true) SELECT policy. Same mechanic as 00031: revoke
-- table-level SELECT, grant back everything except the sensitive columns.
-- Dynamic so it stays correct for columns added between environments; NOTE
-- for future migrations: adding a column to artist_profiles now requires an
-- explicit GRANT SELECT (new_col) — new columns fail closed (secure default,
-- and staging surfaces it immediately).
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'artist_profiles'
     AND column_name NOT IN ('rejection_reason', 'reviewed_by', 'reviewed_at', 'stripe_account_id');
  EXECUTE 'REVOKE SELECT ON artist_profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON artist_profiles TO anon, authenticated', cols);
END $$;

-- (3) IN-APP FAN-OUT. The follower/price-drop notification triggers (00017)
-- fire on any listing insert/price change — a non-live artist's activity
-- must not notify anyone (nothing of theirs is reachable). In practice a
-- draft artist has no followers (their page 404s), but a rejected-after-live
-- artist may still have them.
-- Bodies identical to 00017 apart from the is_live guard.
CREATE OR REPLACE FUNCTION notify_followers_new_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  artist_name TEXT;
BEGIN
  IF NEW.status <> 'available' THEN RETURN NEW; END IF;
  SELECT display_name INTO artist_name
    FROM artist_profiles WHERE id = NEW.artist_id AND is_live = true;
  IF NOT FOUND THEN RETURN NEW; END IF;  -- artist not live: no fan-out
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT f.follower_id, 'new_listing', 'New work',
         coalesce(artist_name, 'An artist') || ' just listed "' || NEW.title || '".',
         '/listing/' || NEW.id
  FROM follows f WHERE f.artist_id = NEW.artist_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_savers_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.price_cents >= OLD.price_cents THEN RETURN NEW; END IF;
  IF OLD.last_price_drop_alert_at IS NOT NULL
     AND OLD.last_price_drop_alert_at > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM artist_profiles WHERE id = NEW.artist_id AND is_live = true
  ) THEN RETURN NEW; END IF;  -- artist not live: no fan-out
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT s.profile_id, 'price_drop', 'Price drop',
         '"' || NEW.title || '" is now $' || to_char(NEW.price_cents / 100.0, 'FM999990.00')
           || ' (was $' || to_char(OLD.price_cents / 100.0, 'FM999990.00') || ').',
         '/listing/' || NEW.id
  FROM saved_listings s WHERE s.listing_id = NEW.id;
  NEW.last_price_drop_alert_at := now();
  RETURN NEW;
END;
$$;
