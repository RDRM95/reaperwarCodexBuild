import { describe, expect, it } from 'vitest';
import { assignAttackBearings } from '../src/simulation/manoeuvre';

describe('large-fleet attack bearings', () => {
  it('assigns stable bearings without exceeding the JavaScript argument limit', () => {
    // 150,000 exceeds V8's practical function argument limit when spread into Math.max.
    // Use a single role to exercise the worst-case custom-fleet path.
    const members = Array.from({ length: 150_000 }, (_, index) => ({
      id: `frigate-${index}`,
      lateral: index - 75_000,
    }));
    const bearings = assignAttackBearings('frigate', members);
    expect(bearings.size).toBe(members.length);
    expect(bearings.get('frigate-0')).toBeDefined();
    expect(bearings.get('frigate-149999')).toBeDefined();
    for (const bearing of bearings.values()) {
      expect(Number.isFinite(bearing.swing)).toBe(true);
      expect(Number.isFinite(bearing.right)).toBe(true);
      expect(Number.isFinite(bearing.up)).toBe(true);
    }
    // Member order cannot change assignment: each hull's ID and deployment offset are stable.
    const reversed = assignAttackBearings('frigate', [...members].reverse());
    expect(reversed.size).toBe(bearings.size);
    for (const [id, bearing] of bearings) expect(reversed.get(id)).toEqual(bearing);
  });
});
