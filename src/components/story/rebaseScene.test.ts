import { describe, expect, it } from 'vitest';
import { REBASE_STATES, SCENE, SCENE_H, SCENE_W, isRebaseState, place } from './rebaseScene';

describe('place', () => {
  const table = {
    blobs: { x: 10, y: 20, w: 30, h: 40 },
    tailor: { x: 50, y: 60, w: 70, h: 80, o: 0.3, line: 0 },
  };

  it('uses the state’s own spot, with defaults filled in', () => {
    expect(place(table, 'blobs')).toEqual({ x: 10, y: 20, w: 30, h: 40, o: 1, r: 0, line: 1 });
    expect(place(table, 'tailor').o).toBe(0.3);
  });

  it('fades out where it last was in a later state it isn’t in', () => {
    expect(place(table, 'typst')).toEqual({ x: 50, y: 60, w: 70, h: 80, o: 0, r: 0, line: 0 });
  });

  it('waits invisibly where it will first appear before that', () => {
    expect(place(table, 'files')).toEqual({ x: 10, y: 20, w: 30, h: 40, o: 0, r: 0, line: 1 });
  });
});

describe('the rebase scene', () => {
  it('recognises only its own states', () => {
    expect(isRebaseState('tailor')).toBe(true);
    expect(isRebaseState('nope')).toBe(false);
    expect(isRebaseState(undefined)).toBe(false);
  });

  it('shows every item in at least one state', () => {
    for (const [id, table] of Object.entries(SCENE)) {
      const seen = REBASE_STATES.some((state) => place(table, state).o > 0);
      expect(seen, id).toBe(true);
    }
  });

  it('keeps every visible item inside the scene', () => {
    for (const [id, table] of Object.entries(SCENE)) {
      for (const state of REBASE_STATES) {
        const p = place(table, state);
        if (p.o === 0) continue;
        expect(p.x, `${id} in ${state}`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${id} in ${state}`).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w, `${id} in ${state}`).toBeLessThanOrEqual(SCENE_W);
        expect(p.y + p.h, `${id} in ${state}`).toBeLessThanOrEqual(SCENE_H);
      }
    }
  });

  it('has something on screen in every state', () => {
    for (const state of REBASE_STATES) {
      const visible = Object.values(SCENE).filter((table) => place(table, state).o > 0);
      expect(visible.length, state).toBeGreaterThan(0);
    }
  });
});
