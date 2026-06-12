-- Phase 3: robust artist profile fields + listing drafts.
-- (pinned_listing_ids, search_vector, series_id already exist from 00002.)

ALTER TABLE artist_profiles ADD COLUMN story TEXT;
ALTER TABLE artist_profiles ADD COLUMN primary_mediums TEXT[];

ALTER TABLE listings DROP CONSTRAINT listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status = ANY (ARRAY['available'::text, 'sold'::text, 'commission_only'::text, 'hidden'::text, 'draft'::text]));
