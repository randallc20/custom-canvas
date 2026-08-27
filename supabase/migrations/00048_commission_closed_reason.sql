-- P6.1 (hardening plan): declined, buyer-cancelled and quote-declined all
-- collapse to status 'cancelled', displayed as a bare "Closed". Record who
-- closed it and (optionally) why, so the UI can say "Declined by artist" /
-- "Cancelled by you" and show the artist's reason to the requester.
ALTER TABLE commissions ADD COLUMN closed_reason TEXT;
ALTER TABLE commissions ADD COLUMN closed_by TEXT
  CHECK (closed_by IN ('artist', 'requester'));
