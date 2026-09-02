'use client';

import { TextareaHTMLAttributes, forwardRef, useId } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  /** Helper copy rendered under the control (above any error). */
  hint?: string;
  /** Keeps the accessible name where a fieldset legend already says it. */
  hideLabel?: boolean;
}

/** Mirrors Input's useId label wiring — every hand-rolled `<label>` + bare
 *  `<textarea>` in the app was an unnamed "edit text, multiline". */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, hideLabel = false, id, className = '', ...props }, ref) => {
    const autoId = useId();
    const textareaId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-medium text-ink'}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink transition-colors
            placeholder:text-muted/70
            focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20
            ${error ? 'border-red-500' : 'border-line'}
            ${className}`}
          {...props}
        />
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
