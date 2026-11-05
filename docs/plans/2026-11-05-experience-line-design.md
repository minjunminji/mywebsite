# Experience Line — Design

**Date:** 2026-11-05
**Status:** Implemented

**Prototype:** `docs/plans/2026-11-05-experience-line-prototype.html` (open it
from a repo checkout). It is the approved throwaway. Its copy and the job data
are placeholders; the site reads `EXPERIENCE` in `storyData.ts`.

## Intent

The experience stop was a plain résumé list: the drawing faded out and the
visitor landed on four rows of small text, the coldest screen on the site.
It becomes one more drawn thing in the train world: a transit line with a
station per job.

## Decided with Ryan

- **One line, four stations, evenly spaced.** Oldest at the top, ending at a
  "now" terminus. An earlier version split sailbot onto a parallel branch to
  show the overlap. It needed explaining, so it was dropped. The years under
  each station name carry the dates.
- **One stop at a time.** One scroll gesture, arrow or page key, or station
  click moves the train one stop. A trackpad's momentum can't skip a stop.
- **A card per stop.** Company, role and years, and every bullet at full
  strength.
- **No sentence-by-sentence lit reading.** That stays special to projects.
- **No living diagrams.** They were prototyped (one per job, one state per
  bullet) and dropped.
- **No "stop X of 4" label.**
- **Bullets lead with the verb, not "i".**

## Builder's calls

- The line drafts itself in on arrival (1.4s) and boils at 8fps with the same
  noise as the cursor and the piano player, stroked with the shared pencil
  grain. The line ahead of the train is faint; the stretch behind it is bright.
- Arriving at the stop always starts at the first station.
- "you are here" shows under the last station when you're on it.
- Station labels are the buttons (real text, not canvas), so they are
  readable and focusable. The current one has `aria-current="step"`, and the
  card is a polite live region.
- Wheel and keys follow the project reader's ownership rules
  (`story/inputOwnership.ts`). The tldr, the explainer and the piano player
  keep their own input, and input is off while an overlay covers the stop.
- Reduced motion: no draft, no boil, and the train and card jump.
- Mobile keeps showing the tldr page (`MobileTldr`); this is desktop only.

## Code

- `experience/experienceLine.ts`: pure layout, the one-gesture-one-stop
  wheel gate, easing and the open pencil line (tests alongside).
- `experience/ExperienceSection.tsx`: the canvas map, station buttons and card.
- `pencilStroke.ts` strokes open lines too; `sketchOutline.ts` exports its
  value noise.
