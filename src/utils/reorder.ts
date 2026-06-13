// Shared swap-based reorder for display_order lists (photos, videos, series).
export async function swapDisplayOrder<T extends { id: string }>(
  items: T[],
  index: number,
  dir: -1 | 1,
  update: (id: string, displayOrder: number) => Promise<void>
): Promise<boolean> {
  const j = index + dir;
  if (j < 0 || j >= items.length) return false;
  await Promise.all([update(items[index].id, j), update(items[j].id, index)]);
  return true;
}
