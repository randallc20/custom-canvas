import { describe, it, expect } from 'vitest';
import { artistRepliedInTime, ReplyWindowMessage } from './artistRepliedInTime';
import { REPLY_WINDOW_BUSINESS_DAYS } from './evaluateProtection';

const BUYER = 'buyer-1';
const ARTIST = 'artist-user-1';
// A Monday, so business-day arithmetic in the fixtures is easy to follow.
const ORDER_CREATED = '2026-08-03T12:00:00.000Z';

function msg(sender: string, at: string): ReplyWindowMessage {
  return { sender_id: sender, created_at: at };
}

function check(messages: ReplyWindowMessage[], now = '2026-08-31T12:00:00.000Z') {
  return artistRepliedInTime(messages, {
    buyerId: BUYER,
    artistUserId: ARTIST,
    orderCreatedAt: ORDER_CREATED,
    windowBusinessDays: REPLY_WINDOW_BUSINESS_DAYS,
    now,
  });
}

describe('artistRepliedInTime', () => {
  it('the window is three business days', () => {
    expect(REPLY_WINDOW_BUSINESS_DAYS).toBe(3);
  });

  it('passes when the buyer never wrote', () => {
    expect(check([])).toBe(true);
    expect(check([msg(ARTIST, '2026-08-04T12:00:00.000Z')])).toBe(true);
  });

  it('passes a reply inside the window', () => {
    // Tue 4th -> Fri 7th = 3 business days, exactly the window
    expect(check([
      msg(BUYER, '2026-08-04T12:00:00.000Z'),
      msg(ARTIST, '2026-08-07T12:00:00.000Z'),
    ])).toBe(true);
  });

  it('fails a reply on the fourth business day (would have passed the old 5-day window)', () => {
    // Mon 3rd 13:00 -> Fri 7th = 4 business days
    expect(check([
      msg(BUYER, '2026-08-03T13:00:00.000Z'),
      msg(ARTIST, '2026-08-07T12:00:00.000Z'),
    ])).toBe(false);
  });

  it('skips the weekend when counting', () => {
    // Fri 7th -> Wed 12th = 3 business days
    expect(check([
      msg(BUYER, '2026-08-07T12:00:00.000Z'),
      msg(ARTIST, '2026-08-12T12:00:00.000Z'),
    ])).toBe(true);
  });

  it('ignores buyer messages from before the order existed (shared thread from another listing)', () => {
    // The pair already had a thread about listing A. That question was never
    // answered, but it is not about this order.
    expect(check([
      msg(BUYER, '2026-07-20T12:00:00.000Z'),
      msg(BUYER, ORDER_CREATED), // exactly at creation: still pre-order
    ])).toBe(true);
  });

  it('fails an unanswered post-order question in a shared thread', () => {
    // Same shared thread: chatter about listing A, then the buyer asks about
    // this order and the artist never replies.
    expect(check([
      msg(BUYER, '2026-07-20T12:00:00.000Z'),
      msg(ARTIST, '2026-07-21T12:00:00.000Z'),
      msg(BUYER, '2026-08-04T12:00:00.000Z'),
    ])).toBe(false);
  });

  it('an outstanding question is only a failure once the window has passed', () => {
    const pending = [msg(BUYER, '2026-08-04T12:00:00.000Z')];
    // Two business days later: still inside the window.
    expect(check(pending, '2026-08-06T12:00:00.000Z')).toBe(true);
    // Four business days later: past it.
    expect(check(pending, '2026-08-10T12:00:00.000Z')).toBe(false);
  });

  it('measures consecutive buyer messages from the first one', () => {
    expect(check([
      msg(BUYER, '2026-08-03T13:00:00.000Z'),
      msg(BUYER, '2026-08-06T12:00:00.000Z'),
      msg(ARTIST, '2026-08-07T12:00:00.000Z'), // 4 business days after the first
    ])).toBe(false);
  });

  it('does not treat a system or third-party message as the artist replying', () => {
    expect(check([
      msg(BUYER, '2026-08-03T13:00:00.000Z'),
      msg('system-or-other', '2026-08-04T12:00:00.000Z'),
      msg(ARTIST, '2026-08-07T12:00:00.000Z'),
    ])).toBe(false);
  });

  it('accepts messages out of order', () => {
    expect(check([
      msg(ARTIST, '2026-08-05T12:00:00.000Z'),
      msg(BUYER, '2026-08-04T12:00:00.000Z'),
    ])).toBe(true);
  });
});
