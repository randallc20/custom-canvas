-- reports had INSERT + SELECT policies but NO UPDATE policy, so the admin
-- "Resolve" action was a silent zero-row no-op: the toast claimed success,
-- the card vanished locally, and the report stayed pending forever (the
-- pending counter only ever grew). Let admins actually resolve.

CREATE POLICY "Admins can update reports" ON reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
