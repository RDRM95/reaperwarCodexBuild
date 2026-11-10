# After-action survival labels

The reported "Fleet survival" was not the surviving ship count: `summariseSide` weights non-fighter losses by `pointValue`. Losing expensive capitals can leave 21 of 59 hulls (36%) alive while retaining only 9% of the deployed combat points.

The report now displays **Ships surviving (hull count)** and **Combat value retained** separately, with explanatory tooltips. Timeline comparison uses the same explicit distinction. Combat formulas, winners, saves and the existing weighted `survivalPercent` field are unchanged; the separate instant-battle report already reports hull-count survival.

Validation: TypeScript and production build pass. The production Chromium reporting regression passes for the exact 59 deployed / 38 destroyed / 21 surviving / 9% weighted example, and for a side with zero deployed hulls. [Actual report capture](qa/results-survival-20261110/report.png). The fixture verifies presentation, not a newly simulated combat outcome.

Isolated branch: `fix/results-survival-labels-20261110`, based on upstream `5152826`. PR/check/deployment gates still apply; the repository API was blocked in this environment at the start of this continuation.
