-- link_education_partners has been INVALID SQL since 00008: an UPDATE's
-- FROM LATERAL subquery may not reference the update target ("e"), so every
-- call fails with 42P10 — which meant EVERY education save in the app errored
-- (the old UI swallowed it into a generic "Failed to update profile" toast;
-- the e2e suite finally surfaced it). Same matching semantics, expressed as a
-- correlated scalar subquery, which IS allowed to reference the target row.

CREATE OR REPLACE FUNCTION link_education_partners(p_artist_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE artist_education e
  SET partner_id = (
    SELECT g.id
    FROM gallery_profiles g
    WHERE g.is_verified = TRUE
      AND g.partner_type IN ('school', 'museum', 'artist_residency')
      AND lower(trim(g.gallery_name)) = lower(trim(e.institution))
    ORDER BY g.verified_at NULLS LAST, g.created_at
    LIMIT 1
  )
  WHERE e.partner_id IS NULL
    AND (p_artist_id IS NULL OR e.artist_id = p_artist_id)
    -- Only touch rows that actually have a match — keeps ROW_COUNT honest
    -- and avoids rewriting every unlinked row to the NULL it already holds.
    AND EXISTS (
      SELECT 1 FROM gallery_profiles g
      WHERE g.is_verified = TRUE
        AND g.partner_type IN ('school', 'museum', 'artist_residency')
        AND lower(trim(g.gallery_name)) = lower(trim(e.institution))
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
