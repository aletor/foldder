/** Cuántas imágenes del lienzo pueden descodificarse a la vez. */
export const CANVAS_MEDIA_SLOT_LIMIT = 6;

type Release = () => void;

let active = 0;
const waiters: Array<() => void> = [];

function grant(resolve: (release: Release) => void): void {
  active += 1;
  let released = false;
  resolve(() => {
    if (released) return;
    released = true;
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  });
}

export function acquireCanvasMediaSlot(): Promise<Release> {
  return new Promise((resolve) => {
    if (active < CANVAS_MEDIA_SLOT_LIMIT) {
      grant(resolve);
      return;
    }
    waiters.push(() => grant(resolve));
  });
}

/** Solo tests. */
export function resetCanvasMediaSlotsForTests(): void {
  active = 0;
  waiters.length = 0;
}
