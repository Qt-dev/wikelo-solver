export type IndexedPrice = {
  itemId: string;
  uexItemId: number | null;
};

/**
 * Prices must be ordered newest-first. A UEX listing ID identifies the same
 * market listing regardless of which game item caused the snapshot to be saved.
 */
export function indexLatestPrices<T extends IndexedPrice>(prices: T[]) {
  const byItem = new Map<string, T>();
  const byListing = new Map<number, T>();
  for (const price of prices) {
    if (!byItem.has(price.itemId)) byItem.set(price.itemId, price);
    if (price.uexItemId !== null && !byListing.has(price.uexItemId)) byListing.set(price.uexItemId, price);
  }
  return { byItem, byListing };
}
