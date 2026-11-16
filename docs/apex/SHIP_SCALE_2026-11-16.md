# Ship size and scale against canon (16 Nov 2026)

Owner's request: "check size and scale of ships for canon accuracy".

Every class with a model was measured: its catalogue length, where that length comes from, and the size its model
is actually drawn at.

## Findings

**1. Catalogue lengths agree with canon wherever canon states one, with one exception.**

| Class | Catalogue | Canon | |
|---|---|---|---|
| Sovereign-class Reaper | 2,000 m | "roughly two kilometres" (ME3 codex) | agrees |
| Reaper destroyer | 160 m | 160 m (ME3 codex) | agrees |
| UNSC Infinity | 5,694 m | 5,694 m | agrees |
| CCS-class battlecruiser | 1,782 m | 1,782 m | agrees |
| CAS-class assault carrier | 5,347 m | 5,346.7 m | agrees |
| **Marathon-class heavy cruiser** | **1,170 m** | **1,192 m** (Halopedia, citing the Essential Visual Guide) | **corrected to 1,192 m** |

Mass Effect gives no length for most hulls. The catalogue says so on each one (cruisers, most dreadnoughts, the
Destiny Ascension, the geth dreadnought and the quarian liveship are marked as estimates or as inferred from what
canon says by comparison), and the comparisons canon does make hold: a Sovereign is more than twice the length of
any Council dreadnought; the Destiny Ascension is the largest Council dreadnought; the geth dreadnought is larger
than the other races'; the SR-2 is larger than the SR-1; a Reaper destroyer is frigate-sized.

**2. Twenty models were not drawn at their catalogue length.** A builder lays a hull out in proportions of its
length, and a bow, a drive block or a fin ran past the ends.

| Model | Catalogue | Was drawn | |
|---|---|---|---|
| Destiny Ascension | 1,600 m | 1,372 m | 14 % short |
| Turian cruiser | 560 m | 599 m | 7 % long |
| Cerberus cruiser, dreadnought | 560, 900 m | 598, 962 m | 7 % long |
| Salarian frigate, cruiser, dreadnought | 150, 520, 860 m | 160, 546, 906 m | 5 to 7 % long |
| Turian dreadnought | 950 m | 1,008 m | 6 % long |
| Quarian cruiser, heavy cruiser | 480, 820 m | 510, 858 m | 5 to 6 % long |
| Geth cruiser, dreadnought | 520, 1,100 m | 548, 1,123 m | 2 to 5 % long |
| Asari cruiser, dreadnought | 500, 900 m | 519, 926 m | 3 to 4 % long |
| Valkyrie | 2,020 m | 2,083 m | 3 % long |
| Oculus | 16 m | 17 m | 7 % long |
| Omaha, Aegis, Cerberus Omaha, Cerberus frigate | 1,800, 1,650, 1,800, 180 m | 1,780, 1,632, 1,790, 176 m | up to 2 % short |

Now every hull is drawn within half a percent of the length it states (`fitToLength` in
`src/rendering/ships/index.ts`): the whole model is scaled about its origin by one factor, so its proportions, gun
muzzle and engine positions are as its builder made them. The simulation is not touched: it always used the
catalogue length.

**3. Piloted fighters are drawn at twice their catalogue length** (a Trident is 18 m in the catalogue and 36 m on
screen). This is unchanged, and now pinned by a test so that it is on record and not an accident. Halving them
would halve what you see of a fighter beside a kilometre of dreadnought; say if you want them at true size.

## Left for the owner

- **Harbinger is 2,400 m**, entered as "described as larger than other Reapers". I could not confirm that from a
  canon source in this session, and in the games Harbinger appears to be a Sovereign-class hull. Unchanged.
- **Fighter size**, above.

Tests: `tests/ship-scale.test.ts` (every modelled class, and the canon lengths and comparisons).
One pinned value changed: the Marathon's model length in `tests/crossover-models.test.ts`, 11.70 to 11.92 units, for
the corrected catalogue length.
