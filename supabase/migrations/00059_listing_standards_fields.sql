-- L4 — the Listing Standards' required disclosures, and the mature flag.
--
-- Listing Standards Part one says every listing must state WHAT IT IS
-- (original / limited edition / open edition / reproduction), medium,
-- dimensions with depth where relevant, year, CONDITION, and edition details
-- where applicable — plus, where applicable, hazard and handling disclosures
-- (weight, glass, sharp edges, toxicity, installation, display restrictions,
-- allergens, shipping restrictions).
--
-- The listing had medium, dimensions, year, description and the AI
-- disclosure. It had no notion of edition type, no condition field, and no
-- way to tag mature work. Two of those are the difference between "a print
-- sold as an original" being a policy and being enforceable.
--
-- Part three: "Nudity and mature themes | Permitted as fine art; must be
-- tagged so it can be filtered." Ruling D8 takes the plan's default —
-- hide-by-default with a viewer opt-in — rather than blurring: a filter that
-- only softens the image still puts the work in front of someone who did not
-- ask for it, and "so it can be filtered" reads as a real filter.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS edition_type TEXT NOT NULL DEFAULT 'original'
    CHECK (edition_type IN ('original', 'limited_edition', 'open_edition', 'reproduction')),
  ADD COLUMN IF NOT EXISTS edition_size INT CHECK (edition_size IS NULL OR edition_size > 0),
  ADD COLUMN IF NOT EXISTS edition_number INT CHECK (edition_number IS NULL OR edition_number > 0),
  ADD COLUMN IF NOT EXISTS is_signed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_notes TEXT,
  ADD COLUMN IF NOT EXISTS handling_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_mature BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN listings.edition_type IS
  'What the piece IS, in the Listing Standards'' words. open_edition and reproduction must carry "print" or "reproduction" in the title (enforced in the zod schema, quoting the standard).';
COMMENT ON COLUMN listings.condition_notes IS
  'Required on new listings (min 10 chars in the schema): damage, repair, restoration or material aging. "New, no damage" is a complete answer.';
COMMENT ON COLUMN listings.handling_notes IS
  'The Listing Standards Part one "where applicable" disclosures: weight, glass, sharp edges, hazardous or organic components, installation, display restrictions, allergens, shipping restrictions.';
COMMENT ON COLUMN listings.is_mature IS
  'Nudity or mature themes (Listing Standards Part three). Excluded from the public feed, home shelves, search and artist grids unless the viewer opts in; the listing page shows a click-through notice. Ruling D8.';

-- Existing rows default to original/unsigned with no condition notes. That is
-- the honest state: the two production listings and the DEV/demo rows were
-- reviewed and are original works, and the columns are new — so `condition_notes`
-- is NULL on them rather than backfilled with a claim nobody made. The schema
-- requires it for NEW listings only; an artist editing an old one is asked for
-- it then.
--
-- Deliberately NOT backfilling is_mature either: false is correct for every
-- existing row, checked by hand.

-- The new columns are artist-owned like the rest of listings, so the 00009
-- update guard needs no change and the client may read and write them under
-- the existing table-level grants and RLS. They are content, not platform
-- record: nothing here decides money or protection.
--
-- The one thing worth an index: the public feed now filters on is_mature. It
-- is a two-value column, so a plain index would be useless — but a PARTIAL
-- index on the common case keeps the default feed's plan the same shape it
-- had before the filter existed.
CREATE INDEX IF NOT EXISTS listings_available_not_mature_idx
  ON listings (created_at DESC)
  WHERE status = 'available' AND NOT is_mature;
