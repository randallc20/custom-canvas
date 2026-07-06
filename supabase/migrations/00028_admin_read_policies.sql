-- Admin pages read via the client SDK under RLS, but Build 2 never granted
-- admins SELECT on the tables they moderate — the Orders, Disputes, and
-- Houston Verified queues rendered empty, and hidden/draft listings were
-- invisible in the listings review tool. Service-role API routes handled
-- the WRITES, which masked the gap.
CREATE POLICY "Admins can see all orders" ON orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can see all reports" ON reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can see all verification requests" ON verification_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can see all listings" ON listings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
