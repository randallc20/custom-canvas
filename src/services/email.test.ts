import { describe, it, expect, vi, beforeEach } from 'vitest';

// The Resend SDK reports failures by RETURNING `{ data: null, error }`, not by
// throwing — so a rotated key or an unverified domain used to be invisible.
// These pin the wrapper's contract: every single-send reads the error, names
// the template and the recipient's domain (never the address) to Sentry at
// level error, and resolves false instead of throwing.
const { send, captureMessage } = vi.hoisted(() => ({ send: vi.fn(), captureMessage: vi.fn() }));

vi.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send }, batch: { send: vi.fn() } }) }));
vi.mock('@sentry/nextjs', () => ({ captureMessage, captureException: vi.fn() }));

import * as email from './email';

beforeEach(() => {
  send.mockReset();
  captureMessage.mockReset();
});

describe('single-send templates', () => {
  it('captures a Sentry error naming the template and recipient domain when Resend reports an error', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'API key is invalid' } });

    const ok = await email.sendNewMessageEmail('artist@example.org', 'Ada', 'hi there', 'https://x/messages/1');

    expect(ok).toBe(false);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, level] = captureMessage.mock.calls[0];
    expect(level).toBe('error');
    expect(message).toContain('template=new_message');
    expect(message).toContain('to=@example.org');
    expect(message).toContain('API key is invalid');
    expect(message).not.toContain('artist@example.org');
  });

  it('resolves true and stays silent on success', async () => {
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null });

    const ok = await email.sendOrderConfirmationEmail('buyer@example.com', 'Bo', 'Bayou', '$10.00', 'ord', 'Ada');

    expect(ok).toBe(true);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('every template goes through the same error path', async () => {
    send.mockResolvedValue({ data: null, error: { name: 'missing_api_key', message: 'Missing API key' } });
    const to = 'someone@domain.test';

    const results = await Promise.all([
      email.sendArtistApprovedEmail(to, 'A'),
      email.sendArtistRejectedEmail(to, 'A', 'reason'),
      email.sendAdminPasswordResetEmail(to, 'A', 'https://x/reset'),
      email.sendNewMessageEmail(to, 'A', 'p', 'https://x/m'),
      email.sendCommissionRequestEmail(to, 'A', 'T'),
      email.sendOrderConfirmationEmail(to, 'A', 'T', '$1', 'o', 'Ar'),
      email.sendNewSaleEmail(to, 'A', 'T', '$1', '$1'),
      email.sendShippingUpdateEmail(to, 'A', 'T', null),
      email.sendReviewReceivedEmail(to, 'A', 5, null, 'R'),
      email.sendCommissionUpdateEmail(to, 'A', 'Ar', 'note', 'c'),
      email.sendCommissionNudgeEmail(to, 'A', 'B', 'T', 'c'),
      email.sendReviewRequestEmail(to, 'A', 'T', 'o'),
      email.sendArtistDripEmail(to, 'A', 'artist_day1'),
      email.sendBuyerDripEmail(to, 'A'),
    ]);

    expect(results).toHaveLength(14);
    expect(results.every((r) => r === false)).toBe(true);
    expect(captureMessage).toHaveBeenCalledTimes(14);
    const templates = captureMessage.mock.calls.map(([m]) => String(m).match(/template=(\w+)/)?.[1]).sort();
    expect(templates).toEqual([
      'admin_password_reset', 'artist_approved', 'artist_drip', 'artist_rejected', 'buyer_drip',
      'commission_nudge', 'commission_request', 'commission_update', 'new_message', 'new_sale',
      'order_confirmation', 'review_received', 'review_request', 'shipping_update',
    ]);
  });
});
