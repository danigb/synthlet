// One `requestAnimationFrame` for the whole page, not one per meter.
//
// Eight meters on a page should be one callback. The driver lives at module
// level, ref-counts its listeners, starts on the first one and cancels the
// pending frame when the last one goes - so a page with nothing to draw has no
// frame pending, which is what makes "add a meter" free rather than a decision.
//
// It is its own file because ticket 16's `subscribe` is the second caller: a
// shared-buffer transport has no events to fire on, so its subscribers are
// driven from here too. Neither caller should have to import the renderer.

/** Called once per animation frame with the frame's timestamp. */
export type FrameTick = (now: number) => void;

// Interval of the `setTimeout` fallback, in ms. Roughly 60 Hz, for environments
// with no `requestAnimationFrame` at all - a worker driving an `OffscreenCanvas`,
// or a test.
const FALLBACK_MS = 16;

const ticks = new Set<FrameTick>();

// Increments once per frame the driver runs. `subscribe` uses it to deliver at
// most one notification per frame from two triggers - a posted message and the
// driver's own tick - without either having to know about the other.
let frameIndex = 0;

// Non-null exactly while a frame is pending. Holds the cancel for whichever
// scheduler requested it, so a fallback timeout is never handed to
// `cancelAnimationFrame`.
let cancelPending: (() => void) | null = null;

function now(): number {
  return typeof performance !== "undefined" && performance
    ? performance.now()
    : Date.now();
}

function schedule() {
  if (cancelPending) return;
  // Resolved per frame rather than once at module load: the globals may not
  // exist yet when the module is first evaluated, and a test may replace them.
  const request = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  if (typeof request === "function") {
    const handle = request(frame);
    cancelPending = () => {
      if (typeof cancel === "function") cancel(handle);
    };
  } else {
    const handle = setTimeout(() => frame(now()), FALLBACK_MS);
    cancelPending = () => clearTimeout(handle);
  }
}

function frame(timestamp: number) {
  cancelPending = null;
  frameIndex++;
  try {
    // A copy, so a tick that detaches itself - or another renderer - during the
    // frame does not mutate the set being iterated.
    for (const tick of Array.from(ticks)) tick(timestamp);
  } finally {
    // In `finally` so one renderer throwing does not stop every other meter on
    // the page. The error still reaches the frame callback and is reported.
    if (ticks.size > 0) schedule();
  }
}

/**
 * Run `tick` once per animation frame. Returns the function that stops it;
 * calling it twice is harmless.
 */
export function onAnimationFrame(tick: FrameTick): () => void {
  ticks.add(tick);
  schedule();
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    ticks.delete(tick);
    if (ticks.size === 0 && cancelPending) {
      cancelPending();
      cancelPending = null;
    }
  };
}

/**
 * Which frame the driver is on. Only the ordering matters: two things that read
 * the same number are inside the same frame.
 */
export function currentFrame(): number {
  return frameIndex;
}

/** True while a frame is pending. For tests, and for 16's success criterion 2. */
export function isDriverRunning(): boolean {
  return cancelPending !== null;
}

/** How many listeners the driver is ticking. For tests. */
export function frameListenerCount(): number {
  return ticks.size;
}
