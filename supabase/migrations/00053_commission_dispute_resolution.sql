-- 00053_commission_dispute_resolution.sql
-- Review-fix phase R10, ruling D5 (docs/REVIEW-FIX-PLAN.md) — finding 04-P2
-- "A disputed commission has no exit anywhere in the app", plus the 04
-- appendix line on the dispute route overwriting artist_notes.
--
-- 1. dispute_reason: the requester's description of what went wrong. It was
--    being written into artist_notes, which is the ARTIST's quote note — the
--    dispute destroyed it on the commission row (only the quote card's copy
--    in message_attachments survived).
-- 2. pre_dispute_status: the status the commission held when the dispute
--    froze it, so a withdrawn dispute restores exactly that instead of
--    guessing between in_progress and delivered. Same pattern as
--    orders.pre_dispute_status (00050).
-- 3. closed_by gains 'admin': a disputed commission is now closable by an
--    admin (disputed -> confirmed | cancelled with a closed_reason), which
--    is neither party.
--
-- No new policies or functions: commissions has had no client UPDATE policy
-- since 00009, so every write here goes through an API route under the
-- service role after an explicit party/role check.

ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS pre_dispute_status TEXT;

ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_pre_dispute_status_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_pre_dispute_status_check
  CHECK (pre_dispute_status IS NULL
         OR pre_dispute_status IN ('in_progress', 'delivered'));

ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_closed_by_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_closed_by_check
  CHECK (closed_by IS NULL OR closed_by IN ('artist', 'requester', 'admin'));
