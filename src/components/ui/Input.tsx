'use client';

import { InputHTMLAttributes, forwardRef, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    // Most call sites pass a label but no id, leaving the label unassociated —
    // screen readers announce nothing and clicking the label does nothing.
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink transition-colors
            placeholder:text-muted/70
            focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20
            ${error ? 'border-red-500' : 'border-line'}
            ${className}`}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
