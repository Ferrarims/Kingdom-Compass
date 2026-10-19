/**
 * Utility functions for attractions and traveler attraction selections
 */

/**
 * Normalizes attraction names for comparison:
 * - Strips out parenthetical explanations like "(Montanha-russa...)"
 * - Normalizes curly apostrophes, quotes, and excess spaces
 */
export function normalizeAttractionName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*\)/g, '') // remove anything inside parentheses
    .replace(/[‘’]/g, "'") // normalize curly single quotes
    .replace(/[“”]/g, '"') // normalize curly double quotes
    .replace(/\s+/g, ' ') // replace multiple spaces with single space
    .trim();
}

/**
 * Checks whether an attraction is selected by a traveler in a given park,
 * looking up both exact name and normalized name in the selections map.
 */
export function isAttractionMatch(
  selections: Record<string, boolean>,
  travelerId: string,
  parkId: string,
  attractionName: string
): boolean {
  if (!selections || !travelerId || !parkId || !attractionName) return false;

  const keyExact = `${travelerId}::${parkId}::${attractionName}`;
  if (selections[keyExact]) return true;

  const normName = normalizeAttractionName(attractionName);
  const keyNorm = `${travelerId}::${parkId}::${normName}`;
  if (selections[keyNorm]) return true;

  // Fallback: check if any key matches travelerId and parkId and normalizes to the same attraction name
  const prefix = `${travelerId}::${parkId}::`;
  for (const [key, val] of Object.entries(selections)) {
    if (val && key.startsWith(prefix)) {
      const storedAttName = key.slice(prefix.length);
      if (normalizeAttractionName(storedAttName).toLowerCase() === normName.toLowerCase()) {
        return true;
      }
    }
  }

  return false;
}
