'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { numberOrNull } from '@/utils/formNumber';
import {
  EDITION_TYPE_LABELS,
  EDITION_TYPES,
  type EditionType,
  type ListingFormData,
} from '@/schemas/listingSchema';

/**
 * Listing Standards Part one, as a form (L4).
 *
 * "What every listing must state: what it is — original, numbered edition,
 * open edition, or reproduction/print; medium and support; dimensions;
 * year made; condition; edition details where applicable" — plus the
 * "where applicable" hazard and handling disclosures.
 *
 * Medium, dimensions and year already had fields. Edition type, condition and
 * the handling disclosures did not, and edition type is the one that makes
 * "describing a reproduction as an original is grounds for immediate removal"
 * an enforceable rule rather than a sentence in a policy.
 *
 * Shared by the create and edit forms so the two cannot drift, in the pattern
 * DimensionsFieldset set.
 */
export function AboutPieceFieldset({
  register,
  errors,
  editionType,
}: {
  register: UseFormRegister<ListingFormData>;
  errors: FieldErrors<ListingFormData>;
  /** Watched, so the edition inputs appear only for a limited edition. */
  editionType: EditionType | undefined;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">
        About this piece{' '}
        <a
          href="/listing-standards"
          target="_blank"
          className="font-normal text-terraText underline underline-offset-2"
        >
          Listing Standards
        </a>
      </legend>

      <Select label="What is it?" {...register('edition_type')} error={errors.edition_type?.message}>
        {EDITION_TYPES.map((t) => (
          <option key={t} value={t}>
            {EDITION_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>

      {editionType === 'limited_edition' && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Edition size"
            type="number"
            {...register('edition_size', { setValueAs: numberOrNull })}
            error={errors.edition_size?.message}
          />
          <Input
            label="This piece's number"
            type="number"
            {...register('edition_number', { setValueAs: numberOrNull })}
            error={errors.edition_number?.message}
          />
        </div>
      )}

      {(editionType === 'open_edition' || editionType === 'reproduction') && (
        <p className="rounded-md bg-sand/60 px-3 py-2 text-xs leading-relaxed text-ink">
          The Listing Standards require that the title clearly identify this as a print or
          reproduction, and it may not be presented as a unique original. Include the word
          &ldquo;print&rdquo; or &ldquo;reproduction&rdquo; in the title.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" className="rounded border-line" {...register('is_signed')} />
        Signed by the artist
      </label>

      <Textarea
        label="Condition"
        rows={3}
        placeholder="Any damage, repair, restoration or material aging. &ldquo;New, no damage&rdquo; is a complete answer."
        {...register('condition_notes')}
        error={errors.condition_notes?.message}
      />

      <Textarea
        label="Handling and safety notes (if any)"
        rows={3}
        placeholder="Substantial weight or special mounting, glass or sharp edges, hazardous or organic components, professional installation, display restrictions (humidity, heat, sunlight), known allergens, shipping restrictions."
        {...register('handling_notes')}
        error={errors.handling_notes?.message}
      />

      {/* Part three: "Nudity and mature themes | Permitted as fine art; must
          be tagged so it can be filtered. No pornography." Ruling D8 makes
          the filter real rather than a blur. */}
      <label className="flex items-start gap-2 rounded-md border border-line bg-sand/40 p-3 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 rounded border-line" {...register('is_mature')} />
        <span>
          This piece contains nudity or mature themes.
          <span className="mt-0.5 block text-xs text-muted">
            Permitted as fine art. Tagging it keeps it out of the browsing feed for people who
            have not chosen to see mature work; it stays on your page and in your shop, behind a
            short notice.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
