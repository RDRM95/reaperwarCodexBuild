import { describe, expect, it } from 'vitest';
import { CockpitOverlay } from '@/ui/screens/cockpitOverlay';
import type { ShipState } from '@/simulation/types';

const field = () => ({ textContent: 'STALE SHIP DATA' });
const makeOverlay = () => {
  // The overlay's update path needs only these fields; no browser DOM or WebGL required.
  const overlay = Object.assign(Object.create(CockpitOverlay.prototype), {
    bracket: { style: { display: 'block', left: '10px', top: '20px' } },
    title: field(), left: field(), right: field(), target: field(),
    nextAt: 999999,
  }) as CockpitOverlay;
  return overlay;
};

describe('cockpit ship-loss readout', () => {
  for (const situation of ['missing', 'destroyed', 'escaped'] as const) {
    it(`clears old instruments and target bracket when the followed ship is ${situation}`, () => {
      const overlay = makeOverlay();
      const ship = situation === 'missing' ? undefined :
        { alive: situation !== 'destroyed', escaped: situation === 'escaped' } as ShipState;
      const host = {
        getShip: () => ship,
        project: () => { throw new Error('dead ship must not be projected'); },
      };
      overlay.update(host, 'old-ship', 100);
      const view = overlay as unknown as {
        bracket: { style: { display: string } };
        title: { textContent: string }; left: { textContent: string };
        right: { textContent: string }; target: { textContent: string };
        nextAt: number;
      };
      expect(view.bracket.style.display).toBe('none');
      for (const field of [view.title, view.left, view.right, view.target])
        expect(field.textContent).toBe('');
      expect(view.nextAt).toBe(0);
    });
  }
});
