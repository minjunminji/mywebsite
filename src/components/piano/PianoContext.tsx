'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import PianoPlayer, { MARGIN, WINDOW_SIZE } from './PianoPlayer';
import { spawnPosition, type Point, type Rect } from './pianoGeometry';

type PianoContextValue = {
  /** True once the player has been opened at least once this session. */
  summoned: boolean;
  /** True while the window is on screen (false after close). */
  visible: boolean;
  /** Open anchored to the trigger word's rect. No-op if already open. */
  summonFrom: (anchor: Rect) => void;
  /** Re-open wherever it was last left, for the corner ♪. */
  restore: () => void;
};

const PianoContext = createContext<PianoContextValue | null>(null);

export function usePiano(): PianoContextValue {
  const context = useContext(PianoContext);
  if (!context) throw new Error('usePiano must be used inside <PianoProvider>');
  return context;
}

/**
 * Owns the floating player's window state and renders it outside the story, so
 * it survives every navigation.
 *
 * The player is not rendered until the first summon — an always-mounted YouTube
 * embed would cost a few hundred KB on every page load for visitors who never
 * use it. After that first mount it stays mounted forever; closing only hides
 * and pauses it, because unmounting would reload the embed and lose the
 * listener's place in an 18-minute recording.
 */
export function PianoProvider({ children }: { children: ReactNode }) {
  const [summoned, setSummoned] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Point>({ x: MARGIN, y: MARGIN });

  const summonFrom = useCallback(
    (anchor: Rect) => {
      // Clicking the word while the player is already open shouldn't yank it
      // back across the screen.
      if (visible) return;
      setPosition(
        spawnPosition(
          anchor,
          WINDOW_SIZE,
          { width: window.innerWidth, height: window.innerHeight },
          MARGIN,
        ),
      );
      setSummoned(true);
      setVisible(true);
    },
    [visible],
  );

  const restore = useCallback(() => {
    if (visible) return;
    setVisible(true);
  }, [visible]);

  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ summoned, visible, summonFrom, restore }),
    [summoned, visible, summonFrom, restore],
  );

  return (
    <PianoContext.Provider value={value}>
      {children}
      {summoned ? (
        <PianoPlayer
          visible={visible}
          position={position}
          onPositionChange={setPosition}
          onClose={close}
        />
      ) : null}
    </PianoContext.Provider>
  );
}
