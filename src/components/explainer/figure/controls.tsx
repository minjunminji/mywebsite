// src/components/explainer/figure/controls.tsx
'use client';
import { type ReactNode } from 'react';
import { MONO, MUTED } from '../tokens';

export function Readout({ children, width = '4.5ch' }: { children: ReactNode; width?: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: '0.95rem',
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-block',
        minWidth: width,
      }}
    >
      {children}
    </span>
  );
}

/** A labeled readout: "speed 3.21". */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <Readout>{children}</Readout>
    </span>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Required: raw slider values print float noise (0.15000000000000002). */
  format: (value: number) => string;
};

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <input
        type="range"
        className="ex-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <Readout>{format(value)}</Readout>
    </label>
  );
}

type ToggleProps<T extends string | number> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** When true, renders native `disabled` buttons (out of tab order, inert)
   *  and dims the whole group, instead of just dimming it visually. */
  disabled?: boolean;
};

/** Segmented text toggle: "path  straight / hermite". Plain pressed-state
 *  buttons (each its own Tab stop), not a radiogroup, so the semantics match
 *  the keyboard behavior. */
export function Toggle<T extends string | number>({ label, value, options, onChange, disabled }: ToggleProps<T>) {
  return (
    <span
      role="group"
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.65rem',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <span style={{ color: MUTED }}>{label}</span>
      {options.map((option, i) => (
        <span key={String(option.value)} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.65rem' }}>
          {i > 0 ? <span aria-hidden="true" style={{ color: MUTED }}>/</span> : null}
          <button
            type="button"
            aria-pressed={option.value === value}
            disabled={disabled}
            className="ex-toggle"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        </span>
      ))}
    </span>
  );
}
