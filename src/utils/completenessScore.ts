import { ArtistProfile } from '@/types/artist';

const SCORED_FIELDS: (keyof ArtistProfile)[] = [
  'display_name',
  'bio',
  'artist_statement',
  'banner_image_url',
  'school',
  'neighborhood',
  'website_url',
  'commissions_open',
];

export function calculateCompletenessScore(profile: Partial<ArtistProfile>): number {
  const pointsPerField = 12.5;
  let score = 0;

  for (const field of SCORED_FIELDS) {
    const value = profile[field];
    if (value !== null && value !== undefined && value !== '' && value !== false) {
      score += pointsPerField;
    }
  }

  return Math.round(score);
}
