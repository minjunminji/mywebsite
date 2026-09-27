import { describe, expect, it } from 'vitest';
import {
  STOPS,
  SEGMENTS,
  EXPERIENCE,
  LENSES,
  NAV,
  MOBILE_TLDR_SECTIONS,
  PROJECT_CONTENT,
  stopIndexById,
  isExperienceStop,
  isProjectBodyList,
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

describe('nav', () => {
  it('leads with the name as the home entry', () => {
    expect(NAV[0]).toEqual({ label: 'ryan kim', stopId: 'landing' });
    expect(NAV.some((entry) => entry.label === 'home')).toBe(false);
  });
});

describe('mobile TLDR', () => {
  it('groups the portfolio into labeled prose sections', () => {
    expect(MOBILE_TLDR_SECTIONS.map((section) => section.label)).toEqual([
      'about',
      'now',
      'previously',
      'selected work',
      'outside work',
    ]);

    for (const section of MOBILE_TLDR_SECTIONS) {
      expect(section.body.map((segment) => segment.text).join('').trim()).not.toBe('');
    }

    const copyByLabel = Object.fromEntries(
      MOBILE_TLDR_SECTIONS.map((section) => [
        section.label,
        section.body.map((segment) => segment.text).join(''),
      ]),
    );
    expect(copyByLabel.about).toBe(
      'computer engineering student at ubc building things that live between engineering and design',
    );
    expect(copyByLabel.now).toBe('SWE intern at Superpilot');
    expect(copyByLabel['selected work']).toMatch(/^built rebase/);
    expect(copyByLabel.previously).toBe(
      'SWE intern at shopify, worked on mobile development for the merchant admin app',
    );
  });

  it('links featured work directly from the selected-work paragraph', () => {
    const selectedWork = MOBILE_TLDR_SECTIONS.find(
      (section) => section.label === 'selected work',
    );

    expect(selectedWork?.body.filter((segment) => segment.href)).toEqual([
      { text: 'rebase', href: 'https://www.tryrebase.io/' },
      {
        text: 'mango',
        href: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
      },
    ]);
  });
});

describe('project body', () => {
  it('has exactly one shader explainer trigger, in "this website"', () => {
    const triggers = PROJECT_CONTENT.flatMap((project) =>
      project.body.flatMap((paragraph) =>
        typeof paragraph === 'string' || isProjectBodyList(paragraph)
          ? []
          : paragraph
              .filter((segment) => segment.action === 'shaderExplainer')
              .map((segment) => ({ project: project.key, text: segment.text })),
      ),
    );
    expect(triggers).toEqual([{ project: 'thisWebsite', text: "here's how it works →" }]);
  });
});
