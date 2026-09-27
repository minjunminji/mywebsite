import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./TldrContent.tsx', import.meta.url), 'utf8');

describe('mobile TLDR presentation', () => {
  it('separates sections with spacing rather than divider lines', () => {
    expect(source).not.toContain('borderTop:');
    expect(source).toContain("padding: index === 0 ? '0 0 1.2rem' : '1.2rem 0'");
  });

  it('keeps the sticky-header fade hidden until the page scrolls', () => {
    expect(source).toContain('opacity: mobileScrolled ? 1 : 0');
  });
});
