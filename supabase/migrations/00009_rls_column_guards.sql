-- Security hardening: RLS confined writes to your own ROWS but not which
-- COLUMNS, so users could self-assign role=admin, fake verification badges,
-- rewrite order money, edit others' messages, and jump commission state.
-- These guards freeze privileged columns for non-privileged callers.

-- A context is privileged when: there's no user session (service role, e.g.
-- the Stripe webhook), the caller is an admin, or a trusted SECURITY DEFINER
-- function has set the transaction-local flag before its own writes.
-- Returns a strict boolean — COALESCE matters: current_setting on an unset GUC
-- yields NULL, and `false OR NULL` is NULL, which `NOT (...)` then treats as
-- not-true in the guards, silently defeating them.
CREATE OR REPLACE FUNCTION is_privileged()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL
    OR COALESCE(current_setting('app.privileged', true) = 'on', false)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- profiles: role is the master privilege switch — only admins/service may change it.
CREATE OR REPLACE FUNCTION guard_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_privileged() THEN
    RAISE EXCEPTION 'role can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_update_guard ON profiles;
CREATE TRIGGER profiles_update_guard BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profiles_update();

-- artist_profiles: trust/ranking/payout flags are system-managed.
CREATE OR REPLACE FUNCTION guard_artist_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_houston_verified := OLD.is_houston_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.completeness_score := OLD.completeness_score;
    NEW.stripe_onboarded := OLD.stripe_onboarded;
    NEW.stripe_account_id := OLD.stripe_account_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS artist_profiles_update_guard ON artist_profiles;
CREATE TRIGGER artist_profiles_update_guard BEFORE UPDATE ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_artist_profiles_update();

-- orders: money + linkage are written only by the Stripe webhook (service role).
-- Artists may still change status/tracking/shipping for fulfillment.
CREATE OR REPLACE FUNCTION guard_orders_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.amount_cents := OLD.amount_cents;
    NEW.platform_fee_cents := OLD.platform_fee_cents;
    NEW.artist_payout_cents := OLD.artist_payout_cents;
    NEW.buyer_fee_cents := OLD.buyer_fee_cents;
    NEW.shipping_cents := OLD.shipping_cents;
    NEW.buyer_id := OLD.buyer_id;
    NEW.artist_id := OLD.artist_id;
    NEW.listing_id := OLD.listing_id;
    NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_update_guard ON orders;
CREATE TRIGGER orders_update_guard BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_orders_update();

-- messages: participants may only flip is_read; content/sender are immutable.
CREATE OR REPLACE FUNCTION guard_messages_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.content := OLD.content;
    NEW.sender_id := OLD.sender_id;
    NEW.conversation_id := OLD.conversation_id;
    NEW.message_type := OLD.message_type;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_update_guard ON messages;
CREATE TRIGGER messages_update_guard BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION guard_messages_update();

-- completeness score is recomputed inside this trusted function; mark the
-- transaction privileged so the artist_profiles guard permits the write.
CREATE OR REPLACE FUNCTION refresh_completeness_score(p_artist_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a artist_profiles%ROWTYPE;
  v_avatar TEXT;
  v_score INT := 0;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  SELECT * INTO a FROM artist_profiles WHERE id = p_artist_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT avatar_url INTO v_avatar FROM profiles WHERE id = a.profile_id;

  IF length(trim(coalesce(a.display_name, ''))) > 0 THEN v_score := v_score + 10; END IF;
  IF length(trim(coalesce(a.story, ''))) >= 100 THEN v_score := v_score + 15; END IF;
  IF coalesce(array_length(a.primary_mediums, 1), 0) > 0 THEN v_score := v_score + 5; END IF;
  IF length(trim(coalesce(a.neighborhood, ''))) > 0 THEN v_score := v_score + 5; END IF;
  IF a.fulfillment_pref IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF v_avatar IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF a.banner_image_url IS NOT NULL THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM listings WHERE artist_id = p_artist_id) THEN v_score := v_score + 20; END IF;
  IF a.stripe_onboarded THEN v_score := v_score + 10; END IF;
  IF EXISTS (SELECT 1 FROM artist_education WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM artist_personal_photos WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;

  UPDATE artist_profiles SET completeness_score = v_score WHERE id = p_artist_id;
  RETURN v_score;
END;
$$;

-- commissions: all mutations now go through ownership-checked, service-role
-- API routes. Remove direct user UPDATE so the workflow/price/status can't be
-- driven from the REST endpoint, bypassing those checks.
DROP POLICY IF EXISTS "Involved parties can update commissions" ON commissions;

-- analytics: stop viewer_id spoofing — the insert policy must not let a caller
-- attribute a view to an arbitrary user. viewer_id, when present, must be self.
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON analytics_events;
CREATE POLICY "Insert analytics events" ON analytics_events FOR INSERT
  WITH CHECK (viewer_id IS NULL OR viewer_id = auth.uid());
