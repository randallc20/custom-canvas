import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { buildNewListingEmail, buildPriceDropEmail, sendBulkEmails } from '@/services/email';
import { formatPrice } from '@/utils/formatPrice';

// Server-only email fan-out for listing events. The DB triggers own the
// in-app notifications; the API routes claim the email stamps atomically
// (publish_email_sent_at / price_drop_email_sent_at) before calling these,
// so concurrent requests can't double-send.

// Bounded fan-out: enough for launch scale; beyond this, move to a queue.
const FAN_OUT_CAP = 500;

interface Recipient {
  email: string | null;
  full_name: string | null;
  email_preferences: Record<string, boolean> | null;
  unsubscribe_token: string;
}

export async function fanOutNewListingEmails(listing: {
  id: string;
  title: string;
  artist_id: string;
}): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const [{ data: artist }, { data: follows }] = await Promise.all([
      admin.from('artist_profiles').select('display_name').eq('id', listing.artist_id).single(),
      admin
        .from('follows')
        .select('follower:profiles(email, full_name, email_preferences, unsubscribe_token)')
        .eq('artist_id', listing.artist_id)
        .limit(FAN_OUT_CAP),
    ]);
    const artistName = artist?.display_name ?? 'An artist you follow';
    const recipients = (follows ?? [])
      .map((f) => f.follower as unknown as Recipient | null)
      .filter((p): p is Recipient => !!p?.email && p.email_preferences?.new_listing_alerts !== false);

    await sendBulkEmails(
      recipients.map((p) =>
        buildNewListingEmail(
          p.email as string,
          p.full_name ?? 'there',
          artistName,
          listing.title,
          listing.id,
          p.unsubscribe_token
        )
      )
    );
  } catch (err) {
    // Email fan-out must never fail the listing write.
    Sentry.captureException(err);
  }
}

export async function fanOutPriceDropEmails(listing: {
  id: string;
  title: string;
  newPriceCents: number;
  oldPriceCents: number;
}): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const { data: saves } = await admin
      .from('saved_listings')
      .select('saver:profiles(email, full_name, email_preferences, unsubscribe_token)')
      .eq('listing_id', listing.id)
      .limit(FAN_OUT_CAP);
    const recipients = (saves ?? [])
      .map((s) => s.saver as unknown as Recipient | null)
      .filter((p): p is Recipient => !!p?.email && p.email_preferences?.price_drop_alerts !== false);

    await sendBulkEmails(
      recipients.map((p) =>
        buildPriceDropEmail(
          p.email as string,
          p.full_name ?? 'there',
          listing.title,
          formatPrice(listing.newPriceCents),
          formatPrice(listing.oldPriceCents),
          listing.id,
          p.unsubscribe_token
        )
      )
    );
  } catch (err) {
    Sentry.captureException(err);
  }
}
