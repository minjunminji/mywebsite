import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./controls.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../../../app/globals.css', import.meta.url), 'utf8');

describe('figure controls', () => {
  it('groups controls by purpose instead of rendering one undifferentiated row', () => {
    expect(source).toContain('export function ControlShelf');
    expect(source).toContain('export function ControlGroup');
    expect(source).toContain('className="ex-control-shelf"');
    expect(source).toContain('className="ex-control-group-label"');
  });

  it('renders options as a segmented control with an obvious selected state', () => {
    expect(source).toContain('className="ex-segmented"');
    expect(source).toContain('aria-pressed={option.value === value}');
    expect(source).not.toContain("aria-hidden=\"true\"");
  });

  it('places slider labels above their track and value', () => {
    expect(source).toContain('className="ex-control ex-slider-control"');
    expect(source).toContain('className="ex-control-label"');
  });

  it('keeps secondary controls in a native disclosure', () => {
    expect(source).toContain('export function ControlDisclosure');
    expect(source).toContain('<details className="ex-control-disclosure">');
    expect(source).toContain('<summary>{label}</summary>');
  });

  it('keeps selected text dark so the difference-blend cursor cannot erase it', () => {
    const selectedRule = styles.match(/\.ex-segmented \.ex-toggle\[aria-pressed='true'\] \{([^}]+)\}/)?.[1];
    expect(selectedRule).toBeDefined();
    expect(selectedRule).toContain('color: #1f1812');
    expect(selectedRule).not.toContain('color: #f7f7f5');
  });
});
