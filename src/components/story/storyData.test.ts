import { describe, expect, it } from 'vitest';
import {
  STOPS,
  SEGMENTS,
  EXPERIENCE,
  LENSES,
  stopIndexById,
  isExperienceStop,
} from './storyData';

describe('experience stop', () => {
  it('is the last stop', () => {
    const idx = stopIndexById('experience');
    expect(idx).toBe(STOPS.length - 1);
    expect(idx).toBeGreaterThan(0);
  });

  it('has no loop or still (text only)', () => {
    const stop = STOPS[stopIndexById('experience')];
    expect(stop.loop).toBeUndefined();
    expect(stop.still).toBeUndefined();
    expect(stop.isExperience).toBe(true);
  });

  it('has an empty segment leading into it', () => {
    // SEGMENTS[i] connects STOPS[i] -> STOPS[i+1]; the leg into experience is empty.
    expect(SEGMENTS.length).toBe(STOPS.length - 1);
    expect(SEGMENTS[SEGMENTS.length - 1]).toEqual([]);
  });

  it('isExperienceStop matches only the experience index', () => {
    STOPS.forEach((_, i) => {
      expect(isExperienceStop(i)).toBe(i === stopIndexById('experience'));
    });
  });
});

describe('experience content', () => {
  it('has three entries, each with both lenses populated', () => {
    expect(EXPERIENCE).toHaveLength(3);
    for (const entry of EXPERIENCE) {
      expect(entry.year).toBeTruthy();
      expect(entry.company).toBeTruthy();
      expect(entry.title).toBeTruthy();
      for (const lens of LENSES) {
        expect(Array.isArray(entry.bullets[lens])).toBe(true);
        expect(entry.bullets[lens].length).toBeGreaterThan(0);
      }
    }
  });
});
