import { ArtistProfile } from '@/types/artist';

export interface CompletenessInput extends Partial<ArtistProfile> {
  avatar_url?: string | null;
  has_listings?: boolean;
  has_education?: boolean;
  has_personal_photo?: boolean;
}

// Weights total 100. Statement, influences, videos, series are bonus
// content — they never block a complete profile.
export function calculateCompletenessScore(input: CompletenessInput): number {
  let score = 0;

  if (input.display_name?.trim()) score += 10;
  if ((input.story?.trim().length ?? 0) >= 100) score += 15;
  if ((input.primary_mediums?.length ?? 0) > 0) score += 5;
  if (input.neighborhood?.trim()) score += 5;
  if (input.fulfillment_pref) score += 10;
  if (input.avatar_url) score += 10;
  if (input.banner_image_url) score += 5;
  if (input.has_listings) score += 20;
  if (input.stripe_onboarded) score += 10;
  if (input.has_education) score += 5;
  if (input.has_personal_photo) score += 5;

  return score;
}
