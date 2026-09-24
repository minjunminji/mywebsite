// src/components/explainer/figure/controls.tsx
'use client';
import { type ReactNode } from 'react';

export function Readout({ children, width = '4.5ch' }: { children: ReactNode; width?: string }) {
  return (
    <span className="ex-readout" style={{ minWidth: width }}>
      {children}
    </span>
  );
}

export function ControlShelf({ children }: { children: ReactNode }) {
  return <div className="ex-control-shelf">{children}</div>;
}

export function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ex-control-group" aria-label={label}>
      <div className="ex-control-group-label">{label}</div>
      <div className="ex-control-group-content">{children}</div>
    </section>
  );
}

export function ControlDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="ex-control-disclosure">
      <summary>{label}</summary>
      <div className="ex-control-group-content">{children}</div>
    </details>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="ex-stat">
      <span className="ex-control-label">{label}</span>
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
    <label className="ex-control ex-slider-control">
      <span className="ex-control-label">{label}</span>
      <span className="ex-slider-row">
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
      </span>
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

export function Toggle<T extends string | number>({ label, value, options, onChange, disabled }: ToggleProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="ex-control ex-toggle-control"
      data-disabled={disabled || undefined}
    >
      <span className="ex-control-label">{label}</span>
      <span className="ex-segmented">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            disabled={disabled}
            className="ex-toggle"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}
