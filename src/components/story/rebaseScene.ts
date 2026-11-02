// The rebase project's living diagram, as data: the moments it moves through
// (one per sentence) and where each piece sits in each one. Pure, so the
// component (RebaseBlobs) just reads a spot per piece and lets CSS ease it
// there; scrolling back reverses the same way.

/** The moments, in reading order. */
export const REBASE_STATES = [
  'files', // a fan of near-identical resume files
  'blobs', // the files collapse into one blob per experience
  'baseContent', // one blob opens to its loose base content
  'versions', // polished bullet versions stack under it
  'view', // a resume is a page that points at a few blobs
  'tailor', // a job description greys out the irrelevant blobs
  'bullets', // the picked blobs flatten into resume lines, bullets typed in
  'vague', // one thin blob, a hand-drawn arrow calling it vague
  'refine', // refine asks it a question; an answer types into the field
  'refined', // the answer rises into the blob and is woven into its base content
  'quickAdd', // a quick-add panel logs a win, which flies in and is woven in too
  'typst', // typst source compiles into the page
] as const;

export type RebaseState = (typeof REBASE_STATES)[number];

export const isRebaseState = (value: unknown): value is RebaseState =>
  (REBASE_STATES as readonly unknown[]).includes(value);

/** The scene's own coordinate space; the component scales it to fit. */
export const SCENE_W = 640;
export const SCENE_H = 400;

/** A piece's spot: box, opacity `o`, rotation `r` (deg), outline opacity `line`. */
export type Place = { x: number; y: number; w: number; h: number; o?: number; r?: number; line?: number };
export type Placed = Required<Place>;
export type PlaceTable = Partial<Record<RebaseState, Place>>;

/**
 * Where a piece sits in `state`. In a state it isn't listed for, it fades out
 * where it last was, or, before its first appearance, waits invisibly where it
 * will appear, so every entrance and exit is a fade in place.
 */
export function place(table: PlaceTable, state: RebaseState): Placed {
  const own = table[state];
  if (own) return { o: 1, r: 0, line: 1, ...own };
  const at = REBASE_STATES.indexOf(state);
  for (let i = at - 1; i >= 0; i--) {
    const p = table[REBASE_STATES[i]];
    if (p) return { r: 0, line: 1, ...p, o: 0 };
  }
  for (let i = at + 1; i < REBASE_STATES.length; i++) {
    const p = table[REBASE_STATES[i]];
    if (p) return { r: 0, line: 1, ...p, o: 0 };
  }
  return { x: 0, y: 0, w: 0, h: 0, o: 0, r: 0, line: 0 };
}

/* ---- The pieces --------------------------------------------------------- */

const FILE_TILT = [-7, -2.5, 2.5, 7];
const fileSpot = (i: number): Place => ({ x: 110 + i * 110, y: 84, w: 124, h: 176, r: FILE_TILT[i] });
const blobSlot = (i: number): Place => ({ x: 170, y: 72 + i * 64, w: 300, h: 50 });

function file(i: number): PlaceTable {
  return {
    files: fileSpot(i),
    // Shrink into the blob that replaces it, fading as the blob arrives.
    blobs: { ...blobSlot(i), o: 0 },
  };
}

/** Blobs 0 and 2 are the ones the job description picks. */
function blob(i: number): PlaceTable {
  const picked = i === 0 || i === 2;
  const table: PlaceTable = {
    files: { ...fileSpot(i), o: 0 },
    blobs: blobSlot(i),
    view: { x: 32, y: 70 + i * 62, w: 250, h: 48 },
    tailor: picked
      ? { x: 170, y: 86 + i * 64, w: 300, h: 50 }
      : { x: 200, y: 86 + i * 64, w: 300, h: 50, o: 0.3 },
  };
  if (i === 0) {
    table.baseContent = { x: 110, y: 56, w: 420, h: 220 };
    table.versions = { x: 110, y: 20, w: 420, h: 150 };
    table.bullets = { x: 64, y: 108, w: 512, h: 112, line: 0 };
  } else if (i === 2) {
    table.bullets = { x: 64, y: 232, w: 512, h: 90, line: 0 };
    table.vague = { x: 120, y: 70, w: 400, h: 124 };
    table.refine = { x: 120, y: 22, w: 400, h: 124 };
    table.refined = { x: 120, y: 40, w: 400, h: 160 };
    table.quickAdd = { x: 24, y: 24, w: 380, h: 162 };
  } else {
    // Slide on out of the way as the picked two become resume lines.
    table.bullets = { x: 230, y: 86 + i * 64, w: 300, h: 50, o: 0 };
  }
  return table;
}

function version(j: number): PlaceTable {
  return {
    baseContent: { x: 140, y: 220 + j * 60, w: 390, h: 48, o: 0 },
    versions: { x: 140, y: 188 + j * 62, w: 390, h: 50 },
  };
}

export const SCENE = {
  file0: file(0),
  file1: file(1),
  file2: file(2),
  file3: file(3),
  blob0: blob(0),
  blob1: blob(1),
  blob2: blob(2),
  blob3: blob(3),
  ver0: version(0),
  ver1: version(1),
  ver2: version(2),
  page: {
    view: { x: 330, y: 30, w: 280, h: 340 },
    bullets: { x: 40, y: 56, w: 560, h: 330 },
    typst: { x: 340, y: 48, w: 268, h: 320 },
  },
  slot0: { view: { x: 350, y: 110, w: 240, h: 52 } },
  slot1: { view: { x: 350, y: 182, w: 240, h: 52 } },
  arrows: { view: { x: 0, y: 0, w: SCENE_W, h: SCENE_H, line: 0 } },
  jd: {
    tailor: { x: 120, y: 14, w: 400, h: 56 },
    bullets: { x: 40, y: 6, w: 560, h: 44, line: 0 },
  },
  // A hand-drawn arrow at the vague blob's base content, "vague" at its tail.
  vagueArrow: { vague: { x: 120, y: 150, w: 480, h: 190, line: 0 } },
  question: {
    vague: { x: 150, y: 210, w: 340, h: 180, o: 0 },
    refine: { x: 150, y: 158, w: 340, h: 180 },
    refined: { x: 150, y: 120, w: 340, h: 80, o: 0 },
  },
  // The typed answer: in the question's field, then carried up into the blob's
  // base content (it dissolves there as the blob weaves it in).
  answer: {
    refine: { x: 177, y: 245, w: 290, h: 34, line: 0 },
    refined: { x: 134, y: 117, w: 290, h: 34, line: 0 },
  },
  // Quick add: a panel that opens from a floating + button.
  quick: {
    refined: { x: 556, y: 328, w: 60, h: 40, o: 0 },
    quickAdd: { x: 316, y: 194, w: 280, h: 146 },
  },
  fab: { quickAdd: { x: 576, y: 348, w: 40, h: 40 } },
  source: { typst: { x: 32, y: 48, w: 268, h: 320 } },
  wasm: { typst: { x: 300, y: 186, w: 40, h: 40, line: 0 } },
} satisfies Record<string, PlaceTable>;

export type SceneItem = keyof typeof SCENE;
