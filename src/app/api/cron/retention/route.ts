import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

/**
 * Weekly: the retention periods Privacy §6 promises (L10).
 *
 * The policy states them in a table; nothing enforced them, so "24 months"
 * and "3 years" were aspirations. A retention promise nobody keeps is worse
 * than no promise: it is a statement about the data we hold that is not true.
 *
 *   Analytics events            24 months
 *   Messages between buyer      3 years after the last message in the thread
 *     and artist
 *   Order and payment records   7 years  — NOT touched here
 *   Error logs                  90 days  — Sentry project setting, see runbook
 *   Backups                     90-day rolling cycle — Supabase, see runbook
 *
 * The one subtlety, and the reason this is not two DELETEs: §6 also says
 * order records are kept seven years "for tax, accounting, and defending a
 * dispute or chargeback", and the buyer↔artist thread IS that dispute
 * evidence (it is what seller-protection requirement 6 is judged from). So a
 * thread is only pruned when the parties have no order younger than seven
 * years between them. The two promises are in tension and the longer one
 * wins, which is what the policy's own "How deletion interacts with records
 * we must keep" paragraph describes.
 */

const MONTHS_24_MS = 730 * 24 * 60 * 60 * 1000;
const YEARS_3_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const YEARS_7_MS = 7 * 365 * 24 * 60 * 60 * 1000;

/** A cap per run, so a wrong cutoff cannot empty a table in one pass and a
 *  large first run spreads over a few weeks instead of timing out. */
const BATCH = 500;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const now = Date.now();
  const analyticsCutoff = new Date(now - MONTHS_24_MS).toISOString();
  const threadCutoff = new Date(now - YEARS_3_MS).toISOString();
  const orderKeepCutoff = new Date(now - YEARS_7_MS).toISOString();

  let analyticsDeleted = 0;
  let threadsDeleted = 0;
  let attachmentsDeleted = 0;
  let threadsKeptForOrders = 0;

  // --- Analytics events: 24 months ---------------------------------------
  {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('id')
      .lt('created_at', analyticsCutoff)
      .limit(BATCH);
    if (error) {
      Sentry.captureException(error, { extra: { where: 'cron.retention.analyticsRead' } });
    } else if (data?.length) {
      const { error: delError } = await supabase
        .from('analytics_events')
        .delete()
        .in('id', data.map((r) => r.id as string));
      if (delError) Sentry.captureException(delError, { extra: { where: 'cron.retention.analyticsDelete' } });
      else analyticsDeleted = data.length;
    }
  }

  // --- Message threads: 3 years after the last message -------------------
  {
    const { data: stale, error } = await supabase
      .from('conversations')
      .select('id, participant_one, participant_two, last_message_at, created_at')
      .or(`last_message_at.lt.${threadCutoff},and(last_message_at.is.null,created_at.lt.${threadCutoff})`)
      .limit(BATCH);

    if (error) {
      Sentry.captureException(error, { extra: { where: 'cron.retention.threadsRead' } });
    } else {
      for (const c of stale ?? []) {
        const one = c.participant_one as string | null;
        const two = c.participant_two as string | null;

        // Order records win: this thread is the evidence behind any dispute
        // on an order between these two people.
        if (one && two) {
          const { count, error: orderError } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .gt('created_at', orderKeepCutoff)
            .or(`buyer_id.eq.${one},buyer_id.eq.${two}`);
          if (orderError) {
            // Never delete on a failed check — the failure mode is destroying
            // dispute evidence, which is not recoverable.
            Sentry.captureException(orderError, { extra: { where: 'cron.retention.orderCheck', conversationId: c.id } });
            continue;
          }
          if ((count ?? 0) > 0) {
            threadsKeptForOrders += 1;
            continue;
          }
        }

        // Commissions carry the same seven-year reasoning and reference the
        // thread directly.
        const { count: commissionCount, error: commissionError } = await supabase
          .from('commissions')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .gt('created_at', orderKeepCutoff);
        if (commissionError) {
          Sentry.captureException(commissionError, { extra: { where: 'cron.retention.commissionCheck', conversationId: c.id } });
          continue;
        }
        if ((commissionCount ?? 0) > 0) {
          threadsKeptForOrders += 1;
          continue;
        }

        // Storage objects do not cascade with the rows that point at them, so
        // they go first — a failure here leaves the thread in place and the
        // next run tries again, rather than orphaning private files forever.
        const { data: attachments } = await supabase
          .from('message_attachments')
          .select('url, message:messages!inner(conversation_id)')
          .eq('messages.conversation_id', c.id);
        const paths = (attachments ?? [])
          .map((a) => storagePath(a.url as string))
          .filter((p): p is string => !!p);
        if (paths.length) {
          const { error: storageError } = await supabase.storage.from('chat-attachments').remove(paths);
          if (storageError) {
            Sentry.captureException(storageError, { extra: { where: 'cron.retention.attachments', conversationId: c.id } });
            continue;
          }
          attachmentsDeleted += paths.length;
        }

        const { error: delError } = await supabase.from('conversations').delete().eq('id', c.id);
        if (delError) {
          Sentry.captureException(delError, { extra: { where: 'cron.retention.threadDelete', conversationId: c.id } });
          continue;
        }
        threadsDeleted += 1;
      }
    }
  }

  const summary = { analyticsDeleted, threadsDeleted, attachmentsDeleted, threadsKeptForOrders };
  // Info-level, deliberately: a retention job that runs and deletes nothing
  // looks identical to one that is not running at all, and the difference
  // matters when someone asks whether we keep our own policy.
  Sentry.captureMessage(
    `retention: ${analyticsDeleted} analytics events, ${threadsDeleted} threads (${attachmentsDeleted} attachments); ${threadsKeptForOrders} threads kept as order/commission evidence.`,
    'info',
  );

  return NextResponse.json({ ok: true, ...summary });
}

/** chat-attachments is a private bucket; stored urls carry the object path
 *  after the bucket name. */
function storagePath(url: string): string | null {
  if (!url) return null;
  const marker = '/chat-attachments/';
  const i = url.indexOf(marker);
  if (i === -1) return url.startsWith('http') ? null : url;
  return url.slice(i + marker.length);
}
