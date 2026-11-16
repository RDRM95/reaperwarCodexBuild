# Orders by dragging an area (16 Nov 2026)

Owner's request: "drag and select area for fleet movement and attack".

## Before

The mouse could select one ship at a time (Shift to add another), and a right-click on one enemy ordered an attack
on it. There was no way to mark a group of ships of either side, and no way to send ships to a place.

## Now

| Action | What it does |
|---|---|
| **Shift-drag** with the left button | Draws a frame; on release, selects every ship of ours inside it |
| **Ctrl-drag** | The same, adding to what is selected |
| **B** | Area mode on or off. While on, a plain left-drag draws the frame (the right button still turns the camera) |
| **Shift-right-drag** | Draws a red frame; on release, the selection attacks the enemy ships inside it. With nothing selected, every ship of ours does |
| **Right-click on open space** | The fleets of the selected ships move to that point and hold there |
| Drag with no key held | Turns the camera, as before |
| Click, Shift-click, right-click on a ship | As before |

In the free camera Shift is its speed key, so there the frame takes Ctrl (or B).

**An attack on an area is shared out.** Each ship takes the marked enemy nearest it, counting an enemy that already
has its share of attackers as further away. Ten ships sent at five enemies put two on each, not ten on the
nearest (`assignAreaTargets`, `src/ui/areaOrders.ts`). When a ship's target is destroyed it goes back to choosing
for itself.

**A move is laid on the selection's own level.** The click is taken on the level plane at the mean height of the
selected ships, so a fleet flying above or below the battle's centre is sent where the pointer is on its own
level, not onto the centre plane. The order given is the fleet's existing "defend position": it goes there in
formation and holds, firing at what comes into range. It is a fleet order, so it moves the whole fleet of each
selected ship and clears those ships' individual targets.

A frame shorter than five pixels is a click. The frame and the ring that marks an order take no pointer events,
so they never come between the mouse and the battle. All of it works when the simulation runs on its own thread:
the orders it gives are the two the worker already carries.

Pictures (software renderer): `docs/apex/qa/area-orders-20261116/`.

## Not done

- A move order is a fleet's, not a single ship's: the simulation has no order that sends one ship to a point.
- There is no on-screen button for area mode; it is the B key and the line of help under the fleet orders.

Tests: `tests/area-orders.test.ts` (10), `e2e/area-orders.spec.ts` (1, with the real mouse on the real battle).
