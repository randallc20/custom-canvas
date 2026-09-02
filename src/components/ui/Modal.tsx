'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Everything the browser will put in the tab order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0 && el.tabIndex !== -1
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Visible heading. Becomes the dialog's accessible name via aria-labelledby. */
  title?: string;
  /** Accessible name when the dialog has no visible title (lightboxes). */
  ariaLabel?: string;
  children: ReactNode;
  /** Layout overrides for the sheet/lightbox variants. */
  containerClassName?: string;
  overlayClassName?: string;
  panelClassName?: string;
  /** Render a close button floating over the backdrop when there is no title. */
  floatingClose?: boolean;
  floatingCloseClassName?: string;
  closeLabel?: string;
}

const DEFAULT_CONTAINER = 'fixed inset-0 z-50 flex items-center justify-center';
const DEFAULT_OVERLAY = 'fixed inset-0 animate-fade-in bg-ink/40 transition-opacity';
const DEFAULT_PANEL =
  'relative z-10 mx-4 w-full max-w-lg animate-modal-in rounded-xl border border-line bg-surface p-6 shadow-card';

function CloseIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/**
 * The app's one dialog. Owns the accessibility contract every dialog needs:
 * role/aria-modal, an accessible name, Escape, a labelled close control, focus
 * moved inside on open, Tab wrapped within the dialog, and focus returned to
 * whatever opened it. The drawer and the lightboxes render through it with
 * layout overrides rather than hand-rolling a second (unfocusable) dialog.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  containerClassName = DEFAULT_CONTAINER,
  overlayClassName = DEFAULT_OVERLAY,
  panelClassName = DEFAULT_PANEL,
  floatingClose = false,
  floatingCloseClassName = 'absolute right-4 top-4 z-20 text-cream/80 transition-colors hover:text-cream',
  closeLabel = 'Close',
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // onClose is an inline arrow at almost every call site, so it changes on
  // every render. Keep it in a ref: if it were an effect dependency the trap
  // would re-run and yank focus back to the first control on each keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first control inside the panel; a dialog with nothing
    // focusable (a bare lightbox image) takes focus on the panel itself.
    const first = panel ? focusableWithin(panel)[0] : null;
    (first ?? panel)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const items = focusableWithin(root);
      const active = document.activeElement as HTMLElement | null;
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!active || !root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastItem : firstItem).focus();
      } else if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={containerRef}
      className={containerClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : ariaLabel}
    >
      <div className={overlayClassName} onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={`focus:outline-none ${panelClassName}`}>
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 id={titleId} className="font-display text-lg font-semibold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="text-muted transition-colors duration-150 hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
        )}
        {children}
      </div>
      {!title && floatingClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel} className={floatingCloseClassName}>
          <CloseIcon className="h-7 w-7" />
        </button>
      )}
    </div>,
    document.body
  );
}
