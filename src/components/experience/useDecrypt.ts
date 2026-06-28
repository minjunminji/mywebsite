'use client';

import { useEffect, useRef, useState } from 'react';
import { renderLine } from './decrypt';

export type DecryptLine = { text: string; delays: number[]; seed: number };

// Plays all lines from scramble -> resolved over `durationMs`. Re-runs whenever
// `runKey` changes (e.g. on lens switch). When `reduced` is true, snaps to final.
export function useDecrypt(
  lines: DecryptLine[],
  runKey: unknown,
  durationMs: number,
  reduced: boolean,
): string[] {
  const [display, setDisplay] = useState<string[]>(() => lines.map((l) => l.text));
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(lines.map((l) => l.text));
      return;
    }
    let start = 0;
    const tick = (ts: number) => {
      if (start === 0) start = ts;
      const t = ts - start;
      setDisplay(lines.map((l) => renderLine(l.text, l.delays, t, l.seed)));
      if (t < durationMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(lines.map((l) => l.text)); // exact final text
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, reduced]);

  return display;
}
