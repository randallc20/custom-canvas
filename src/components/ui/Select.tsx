'use client';

import { SelectHTMLAttributes, forwardRef, useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** Keeps the control's accessible name when the label is visually hidden. */
  hideLabel?: boolean;
  /** Wrapper width; the inline filter row needs shrink-to-fit, not w-full. */
  wrapperClassName?: string;
}

/** Mirrors Input's useId label wiring. `hideLabel` keeps the name for screen
 *  readers where the design has no room for a visible one (filter rows). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hideLabel = false, wrapperClassName = 'w-full', id, className = '', children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className={wrapperClassName}>
        {label && (
          <label
            htmlFor={selectId}
            className={hideLabel ? 'sr-only' : 'mb-1 block text-sm font-medium text-ink'}
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink transition-colors
            focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20
            ${error ? 'border-red-500' : 'border-line'}
            ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
