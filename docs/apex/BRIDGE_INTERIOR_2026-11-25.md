# The bridge: a modelled interior for the Cockpit camera on a warship (25 Nov 2026)

Owner's request: "Prioritise improvements to spacecraft interiors, first-person views, camera positioning, lighting,
materials and instrumentation." And, during the work: "its systems alliance ship not a plane cockpit".

## Before

The Cockpit camera on a warship was a flat window frame drawn over the picture (`COCKPIT_CHASE_2026-11-16.md`,
"Limits": "flat overlays, not modelled cockpit interiors"). Three things about the seat itself were wrong, found
on the way:

| Fault | What it was | Now |
|---|---|---|
| The lens | The cockpit's 66 degrees lasted a third of a second: every camera was eased to 50 degrees each frame. The tests read it on the first frame only. | A seat keeps its lens (`CameraRig.apply`). |
| The seat's frame | The seat was placed "above" the hull by the battle's level. A hull is drawn by the shortest turn from "ahead" to its heading, plus its bank and any held roll: measured in the Battle of Earth, frigates are drawn up to 175 degrees from level and Reapers up to 141. The seat of such a hull was beside it or under its keel. The Reaper view's brow had the same fault. | Both take their place from the hull's own up as drawn (`drawnUp`, `attitude.ts`). The cockpit picture's up follows it, eased over about a second. |
| The seat's height | One table for every warship: a fifth of the length ahead of centre, 8.5 % of the length up. Measured on the models, that is inside four hulls (among them the turian frigate and the quarian liveship) and far above most others (a dreadnought's back is 1.8 % up). | Measured on each class's model, once (`seatFit.ts`): on the hull's back at the centre line, 1.4 % of the length above the highest thing ahead of it, lifted until nothing stands in its windows. |

## The bridge

A ship's bridge, not an aircraft's cockpit. The pattern is the Systems Alliance's:

- the **commanding officer's deck**, raised, where the eye stands (1.7 m above it), behind a **rail** with the
  navy's stripe;
- on the rail, a **display at either hand** (the ship: hull, barrier, drive, condition; the target: name, range,
  closing speed, barrier, hull) and the **tactical plot** between them (a hologram turned to the bow: friends,
  hostiles, the target marked, the range chosen to hold the target);
- the **helm pit** ahead and below: two seats, a console each (helm: speed, bearing tape, climb, thrust; batteries:
  each gun's reload and rounds), haptic boards either side;
- **crew stations** down both sides (sensors, power, signals), one to three a side by the size of the ship;
- **windows round the bow**: across it, on either bow, and carried on overhead, so that three quarters of the
  picture ahead is the battle. The ship's own bow lies below them;
- the ship's **name and navy** over the windows, read by looking up.

Three sizes (frigate, cruiser and carrier, dreadnought). Seven navies have their own paint, strip lights, haptic
colour and glazing (Alliance, Hierarchy, Republics, Union, Migrant Fleet, geth, Cerberus); a geth bridge has stations
and no chairs. Every other faction is fitted on the Alliance pattern. A fighter keeps its canopy and a Reaper its
optic, as they were: nothing was added to either.

**Looking around.** The arrow keys turn the head (78 degrees to either side, 32 up, 24 down); let go and it looks
ahead again. The seat does not move and the mouse still does not turn it.

**Lighting.** The room has its own lamps: strip lights in the navy's colour, the glow of the helm and of the plot,
and the sun coming in by the windows from where it is in the battle. The lamps answer the ship: at action stations
(barriers down, or the hull under three quarters) they dim; with the hull under 35 % they go to the alert colour and
beat; a blow on the hull dips them; a hit on the barriers and the ship's own guns flash at the windows.

**Materials.** Painted plate with seams, hatches and fastenings (a procedural texture, used as colour and as
relief), tinted by part; lit trims; faint reflections of the strip lights in the glass.

**The tactical overlay** is cut to the windows while on a bridge, so that a label is in a window and not on a wall.

Settings → Graphics → **Bridge interiors** turns it off (the flat frame returns).

## How it is drawn, and what it costs

The room is a scene of its own (`src/rendering/interior/`), in metres, with the eye at the origin. The battle is
drawn first and the room over it with a fresh depth buffer, so the ship's own hull cannot come through the deck and
the room's lamps light nothing else (a lamp added to the battle's scene would recompile every hull's shader).

- **Six draw calls** for the whole room, whatever its size (structure, strip lights, trims, screens, holograms,
  glass), under 4,000 triangles. Every screen takes its picture from one 1024 x 1024 canvas, repainted eight times a
  second.
- With bloom on, the room is drawn into a target of its own and laid over the battle by one full-screen pass. It is
  not drawn into the battle's own target: that target is multisampled and its samples may be discarded once it has
  been resolved. The target is as large as the picture; it is kept through a cut to the gun camera and back and
  released after the camera has been elsewhere for 30 s.
- **Nothing at all** while the camera is not on a bridge: nothing is built until the first time one is wanted.

## Checks

- Unit, `tests/bridge-interior.test.ts` (15): on every warship model the bridge stands on the hull's back, above
  what is under it, within a tenth of the length, with nothing of the hull in its windows; the room is six meshes,
  closed, with every instrument, and most of the look ahead is clear; the instruments read the ship and change
  nothing; a fleet of 5,000 is thinned on the plot and the target kept; the lamps' answers; the windows' outlines.
- Unit, `tests/cockpit-chase.test.ts` (5 new): the lens is kept; the seat is above the hull's own back at any
  roll; a swing of the drawn roll leaves the eye in its seat; the head's reach and return; the Reaper view on the
  hood of a rolled Reaper.
- Browser, `e2e/bridge-interior.spec.ts`: in a running battle, a dreadnought's bridge, the overlay cut to its
  windows, the arrow keys, the setting off and on, a fighter's canopy and a Reaper's optic unchanged.
- Pictures (software renderer): `docs/apex/qa/bridge-interior-20261125/`, made by `scripts/bridge-visual-qa.mjs`.

## Limits

- No crew: the chairs are empty.
- No shadows inside the room: the sun lights what faces it through the windows without being stopped by the frames.
- The room is fixed to the picture, not to the hull: while the picture's up is easing after a hull whose drawn roll
  has swung, the ship's own bow turns a little against the windows.
- The chase cameras still take their places by the battle's level, as their tests define them. Behind a hull drawn
  rolled over, the "High tail" view looks at its keel.
- Hulls heading away from "ahead" are drawn rolled (the shortest-turn rule above). That is how every hull has
  always been drawn here and it was not changed; from a bridge it means the planet may be overhead.
- Crossover and AU factions have no bridge of their own yet.
- Nothing here was seen on a graphics card.
