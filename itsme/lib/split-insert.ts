export function splitInsert<T>(all: T[], maxVars = 100): T[][] {
  if (all.length === 0) {
    return [];
  }

  const varsPerEntry = Object.keys(all[0] as object).length;
  if (varsPerEntry === 0) {
    return [all];
  }

  const maxBatchSize = Math.max(1, Math.floor(maxVars / varsPerEntry));
  const batches: T[][] = [];

  for (let start = 0; start < all.length; start += maxBatchSize) {
    batches.push(all.slice(start, start + maxBatchSize));
  }

  return batches;
}
