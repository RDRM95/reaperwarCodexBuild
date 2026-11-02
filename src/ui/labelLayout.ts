/** Desired label rectangle in screen pixels; higher priority is placed first. */
export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

/** Accepted rectangle, including any small vertical adjustment. */
export interface LabelPlacement extends LabelCandidate {}

const PADDING = 2;

/**
 * Deterministic, bounded label placement. Equal priorities retain input order.
 * The occupancy grid contains accepted rectangles only, so dense fleets cannot
 * cause pairwise scans of every candidate. This never changes ship markers.
 */
export function layoutLabels(
  candidates: readonly LabelCandidate[],
  viewportWidth: number,
  viewportHeight: number,
  maxLabels = 60,
): LabelPlacement[] {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) return [];
  const budget = Number.isFinite(maxLabels) ? Math.max(0, Math.floor(maxLabels)) : 60;
  if (budget === 0) return [];
  // Normally 64 px; also bound the number of cells for unusually large canvases.
  const cellSize = Math.max(64, Math.ceil(Math.max(viewportWidth, viewportHeight) / 128));
  const buckets = new Map<string, LabelPlacement[]>();
  const placed: LabelPlacement[] = [];
  const acceptedIds = new Set<string>();
  const ordered = candidates.map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate: c }) => [c.x, c.y, c.width, c.height, c.priority].every(Number.isFinite) &&
      c.width > 0 && c.height > 0 && c.width <= viewportWidth && c.height <= viewportHeight)
    .sort((a, b) => b.candidate.priority - a.candidate.priority || a.index - b.index);

  const cellsFor = (rect: LabelPlacement, visit: (key: string) => boolean): boolean => {
    const left = Math.floor((rect.x - PADDING) / cellSize);
    const right = Math.floor((rect.x + rect.width + PADDING) / cellSize);
    const top = Math.floor((rect.y - PADDING) / cellSize);
    const bottom = Math.floor((rect.y + rect.height + PADDING) / cellSize);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (!visit(`${x},${y}`)) return false;
    }
    return true;
  };

  for (const { candidate } of ordered) {
    if (placed.length >= budget) break;
    if (acceptedIds.has(candidate.id)) continue;
    const x = Math.max(0, Math.min(viewportWidth - candidate.width, candidate.x));
    const desiredY = Math.max(0, Math.min(viewportHeight - candidate.height, candidate.y));
    const attemptedY = new Set<number>();
    for (const offset of [0, -candidate.height - PADDING * 2, candidate.height + PADDING * 2]) {
      const y = Math.max(0, Math.min(viewportHeight - candidate.height, desiredY + offset));
      if (attemptedY.has(y)) continue;
      attemptedY.add(y);
      const rect = { ...candidate, x, y };
      const checked = new Set<LabelPlacement>();
      const free = cellsFor(rect, (key) => {
        for (const other of buckets.get(key) ?? []) {
          if (checked.has(other)) continue;
          checked.add(other);
          if (rect.x < other.x + other.width + PADDING && rect.x + rect.width + PADDING > other.x &&
              rect.y < other.y + other.height + PADDING && rect.y + rect.height + PADDING > other.y) return false;
        }
        return true;
      });
      if (!free) continue;
      placed.push(rect);
      acceptedIds.add(rect.id);
      cellsFor(rect, (key) => {
        const bucket = buckets.get(key) ?? [];
        bucket.push(rect);
        buckets.set(key, bucket);
        return true;
      });
      break;
    }
  }
  return placed;
}
