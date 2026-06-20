-- Review-pass security fixes: review fraud, private attachment leak,
-- order status tampering, unrestricted uploads.

-- 1. reviews: the "must own a delivered order, one per order" rule lived only
-- in the API route; the anon client could insert directly. Enforce in RLS.
DROP POLICY IF EXISTS "Buyers can create reviews" ON reviews;
CREATE POLICY "Buyers can review delivered orders" ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.buyer_id = auth.uid()
        AND o.status = 'delivered'
    )
  );

-- 2. orders: the column guard froze money but left status open, letting an
-- artist fake 'delivered' (unlocks reviews) or 'refunded' (no real refund).
-- Non-privileged callers may only advance fulfillment (shipped/delivered);
-- refunded/disputed/pending/paid come only from the webhook or an admin.
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
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('shipped', 'delivered') THEN
      RAISE EXCEPTION 'orders can only be advanced to shipped or delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. chat-attachments: broad authenticated SELECT let any user read any file.
-- Scope to conversation participants (via message_attachments) plus the
-- uploader (own folder), matching the message_attachments table policy.
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
CREATE POLICY "Participants view chat attachments" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM message_attachments ma
        JOIN messages m ON m.id = ma.message_id
        JOIN conversations c ON c.id = m.conversation_id
        WHERE ma.url LIKE '%' || name
          AND (c.participant_one = auth.uid() OR c.participant_two = auth.uid())
      )
    )
  );

-- 4. Bucket limits: cap size and restrict MIME types so a signed upload URL
-- can't push arbitrary/oversized content (SVG/HTML XSS, cost/DoS).
UPDATE storage.buckets SET file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'] WHERE id = 'avatars';
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'] WHERE id IN ('banners', 'listing-images', 'artist-photos');
UPDATE storage.buckets SET file_size_limit = 209715200,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm'] WHERE id = 'artist-videos';
UPDATE storage.buckets SET file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] WHERE id = 'chat-attachments';
