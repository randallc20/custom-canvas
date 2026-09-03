'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ACCEPTANCE_REQUIRED_EVENT, acceptOutstanding, fetchAcceptance } from '@/services/acceptance';

export const ACCEPTANCE_QUERY_KEY = ['acceptance'] as const;

const DISMISS_KEY = 'cc_acceptance_dismissed';

/** Ruling D11 — re-acceptance of the counsel set.
 *
 *  Terms of Service v2.0 added an arbitration clause and a class-action
 *  waiver. §17 makes an affirmative acceptance mandatory for a change that
 *  material, and every existing account had accepted nothing (buyers) or v1.0
 *  (artists). So on the next signed-in visit, everyone is asked again.
 *
 *  Two halves, deliberately:
 *
 *  - This interstitial, which opens once per session and can be dismissed.
 *    Browsing stays open, as D11 requires: nobody is locked out of the site
 *    for not having read a policy yet, and a hard wall on a marketplace
 *    people are still deciding to trust is worse than a banner.
 *  - The 403 in every gated write route (acceptanceGate). That is the actual
 *    enforcement: purchases, listings, messages, reviews and commission
 *    actions are refused until the record is stamped, whatever the browser
 *    does. The banner below is what makes that refusal make sense.
 */
export function AcceptanceInterstitial() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  /** Dismissed for this BROWSER session (sessionStorage, so a new tab or a
   *  fresh visit asks again).
   *
   *  It used to be plain state, which meant every full page load reopened the
   *  dialog — and "browsing stays open" (D11) is not true if you have to
   *  dismiss a modal on every navigation. The standing banner is what carries
   *  the ask after the first dismissal; the 403 in the gated routes is what
   *  actually enforces it. e2e/acceptance.spec.ts caught this. */
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // Storage unavailable (private mode): ask once per page load rather
      // than never.
      setDismissed(false);
    }
  }, []);

  const { data } = useQuery({
    queryKey: ACCEPTANCE_QUERY_KEY,
    queryFn: fetchAcceptance,
    enabled: Boolean(user) && !loading,
    staleTime: 5 * 60_000,
  });

  const outstanding = data?.outstanding ?? [];
  // Only ASK when the outstanding set actually blocks something. A brand-new
  // buyer who just ticked the registration box has the Terms of Sale
  // outstanding — by design, they accept those at checkout (Terms of Sale
  // §1) — and greeting them with a dialog about a document they will meet
  // two clicks later is both wrong and the thing that broke lover-social 8.1
  // the first time this shipped. `blocks` is the server's answer to "does
  // this stop them doing anything", and it is the right trigger.
  const asking = (data?.blocks ?? false) && outstanding.length > 0;

  // Open once, when we first learn there is something outstanding.
  useEffect(() => {
    if (asking && !dismissed) setOpen(true);
  }, [asking, dismissed]);

  // A gated write was just refused. Undo any dismissal and come back: the
  // person has tried to do the thing the acceptance is blocking, which is the
  // moment they most need to be asked.
  useEffect(() => {
    const onRequired = () => {
      try {
        sessionStorage.removeItem(DISMISS_KEY);
      } catch {
        /* storage unavailable */
      }
      setDismissed(false);
      void queryClient.invalidateQueries({ queryKey: ACCEPTANCE_QUERY_KEY });
    };
    window.addEventListener(ACCEPTANCE_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(ACCEPTANCE_REQUIRED_EVENT, onRequired);
  }, [queryClient]);

  const accept = useMutation({
    mutationFn: acceptOutstanding,
    onSuccess: async () => {
      setOpen(false);
      setChecked(false);
      // Cleared, not set: the next time something IS outstanding (a new
      // document version) this must ask again rather than stay dismissed.
      try {
        sessionStorage.removeItem(DISMISS_KEY);
      } catch {
        /* nothing to clear */
      }
      setDismissed(false);
      await queryClient.invalidateQueries({ queryKey: ACCEPTANCE_QUERY_KEY });
      toast('Thank you — your acceptance is recorded.', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  if (!user || !asking) return null;

  const titles = outstanding.map((o) => o.title);
  const titleList =
    titles.length === 1
      ? titles[0]
      : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;

  const close = () => {
    setOpen(false);
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable — the banner still carries the ask */
    }
  };

  return (
    <>
      {/* The standing reminder once the dialog is dismissed. It is also what
          the gated routes' 403 message points at.

          NOT sticky: the navbar is already `sticky top-0 z-40`, and a second
          element pinned to the same offset renders on top of it. It sits
          above the navbar in flow and scrolls away instead. */}
      {!open && (
        <div className="border-b border-terra/30 bg-terraSoft px-4 py-2">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              Our {titleList} {titles.length === 1 ? 'has' : 'have'} been updated. Please review and
              accept to keep buying, listing and messaging.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-lg bg-terraText px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-terraTextDark"
            >
              Review now
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={open}
        onClose={close}
        title="We’ve updated our terms"
        panelClassName="relative z-10 mx-4 max-h-[90vh] w-full max-w-2xl animate-modal-in overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-card"
      >
        <p className="text-sm leading-relaxed text-muted">
          Custom Canvas has new{' '}
          {titles.length === 1 ? 'terms' : 'documents'} effective September 3, 2026. Please read the
          summary below and accept to continue buying, listing, messaging and reviewing. You can
          keep browsing either way.
        </p>

        <div className="mt-5 space-y-5">
          {outstanding.map((doc) => (
            <section key={doc.document} className="rounded-xl border border-line bg-sand/40 p-4">
              <h3 className="text-sm font-semibold text-ink">
                {doc.title}{' '}
                <span className="font-normal text-muted">· version {doc.version}</span>
              </h3>
              <ul className="mt-2 space-y-1.5">
                {doc.summary.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-relaxed text-muted">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-terra" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                <Link
                  href={doc.href}
                  target="_blank"
                  className="font-medium text-terraText underline underline-offset-2"
                >
                  Read the full {doc.title}
                </Link>
                {doc.incorporates?.length ? (
                  <>
                    {' · also covers '}
                    {doc.incorporates.map((inc, i) => (
                      <span key={inc.href}>
                        {i > 0 && ' and '}
                        <Link
                          href={inc.href}
                          target="_blank"
                          className="font-medium text-terraText underline underline-offset-2"
                        >
                          {inc.title}
                        </Link>
                      </span>
                    ))}
                  </>
                ) : null}
              </p>
            </section>
          ))}
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 rounded border-line"
          />
          <span>
            I am 18 or older and I agree to the {titleList}
            {outstanding.some((o) => o.incorporates?.length)
              ? ', and the policies they incorporate.'
              : '.'}
          </span>
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={close} disabled={accept.isPending}>
            Not now
          </Button>
          <Button onClick={() => accept.mutate()} disabled={!checked} loading={accept.isPending}>
            Accept and continue
          </Button>
        </div>
      </Modal>
    </>
  );
}
