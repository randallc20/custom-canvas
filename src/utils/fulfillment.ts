// All shipping semantics branch through here so a new fulfillment
// preference only needs handling in one place.
export function isPickupOnly(pref: string | null | undefined): boolean {
  return pref === 'pickup_only';
}
