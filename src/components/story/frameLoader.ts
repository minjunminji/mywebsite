/** A shared, bounded queue: playback and prefetch never request a frame twice. */
export function createFrameLoader(decode: (src: string) => Promise<boolean>, concurrency = 4) {
  const settled = new Map<string, boolean>();
  const requests = new Map<string, Promise<boolean>>();
  const queue: (() => void)[] = [];
  let running = 0;

  function pump() {
    while (running < concurrency && queue.length) queue.shift()!();
  }

  function load(src: string): Promise<boolean> {
    const existing = requests.get(src);
    if (existing) return existing;
    let complete!: (ready: boolean) => void;
    const result = new Promise<boolean>((resolve) => { complete = resolve; });
    requests.set(src, result);
    queue.push(() => {
      running += 1;
      Promise.resolve().then(() => decode(src)).catch(() => false).then((ready) => {
        settled.set(src, ready);
        running -= 1;
        complete(ready);
        pump();
      });
    });
    pump();
    return result;
  }

  return {
    load,
    status: (src: string) => settled.get(src),
    prefetch(frames: readonly string[], start = 0, count = 6) {
      frames.slice(start, start + count).filter(Boolean).forEach((src) => { void load(src); });
    },
  };
}

function decodeFrame(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const finish = (ready: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(ready);
    };
    // A missing or stalled frame must not permanently lock navigation.
    const timeout = window.setTimeout(() => {
      finish(false);
      image.src = '';
    }, 15000);
    image.onload = () => {
      image.decode().then(() => finish(true), () => finish(false));
    };
    image.onerror = () => finish(false);
    image.src = src;
  });
}

export const frameLoader = createFrameLoader(decodeFrame);
